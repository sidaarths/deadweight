import pLimit from 'p-limit'
import type { Cache } from './cache.js'

// Allowlisted hostnames for registry API calls — prevents SSRF
const ALLOWED_HOSTS = new Set([
  'registry.npmjs.org',
  'api.npmjs.org',
  'pypi.org',
  'api.nuget.org',
  'crates.io',
  'proxy.golang.org',
  'pkg.go.dev',
  'search.maven.org',
  'api.github.com',
  'api.osv.dev',
  'libraries.io',
])

export interface HttpClientOptions {
  cache: Cache
  rateLimitPerSecond: number
  timeoutMs?: number
  /** Total number of attempts (1 initial + N-1 retries). Default: 3 */
  maxAttempts?: number
  /** Base delay in ms for exponential backoff. Default: 1000 (use 1 in tests) */
  retryBaseDelayMs?: number
}

export interface HttpClient {
  /**
   * Fetches a URL and returns the parsed JSON body as `unknown`.
   * Callers are responsible for validating the shape (e.g. via Zod) before use.
   * Results are cached by URL. Responses to requests with an Authorization header
   * are NOT cached to prevent credential-scoped data leaking to unauthenticated callers.
   */
  fetchJson(url: string, options?: RequestInit): Promise<unknown>
}

// Status codes that should NOT be retried (client errors)
const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 422])

// Status codes that ARE retried (server/rate-limit errors)
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

const MS_PER_SECOND = 1000

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Strips query string and fragment from a URL for safe inclusion in error messages. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return '<invalid-url>'
  }
}

export function validateUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS URLs are allowed, got: ${parsed.protocol}`)
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Host not in allowlist: ${parsed.hostname}`)
  }
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    cache,
    rateLimitPerSecond,
    timeoutMs = 10_000,
    maxAttempts = 3,
    retryBaseDelayMs = MS_PER_SECOND,
  } = options

  const limit = pLimit(rateLimitPerSecond)

  async function fetchWithRetry(
    url: string,
    init: RequestInit,
    attempt: number,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }

    if (response.ok) return response

    if (NO_RETRY_STATUSES.has(response.status)) {
      throw new Error(`HTTP ${response.status} for ${redactUrl(url)}`)
    }

    if (RETRY_STATUSES.has(response.status) && attempt < maxAttempts) {
      await delay(retryBaseDelayMs * 2 ** (attempt - 1))
      return fetchWithRetry(url, init, attempt + 1)
    }

    throw new Error(`HTTP ${response.status} after ${attempt} attempt(s) for ${redactUrl(url)}`)
  }

  return {
    async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
      validateUrl(url)

      // Authenticated requests bypass cache: credential-scoped responses must not
      // be served to callers that present different (or no) credentials.
      // Handle both plain-object headers and the Headers class.
      const h = init.headers
      const isAuthenticated =
        h instanceof Headers
          ? h.has('Authorization')
          : typeof h === 'object' && h !== null && 'Authorization' in h
      const cacheKey = `http:${url}`

      if (!isAuthenticated) {
        const cached = await cache.get<unknown>(cacheKey)
        if (cached !== undefined) return cached
      }

      const response = await limit(() => fetchWithRetry(url, init, 1))

      let data: unknown
      try {
        data = await response.json()
      } catch (err) {
        throw new Error(
          `Failed to parse JSON response from ${url}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      if (!isAuthenticated) {
        await cache.set(cacheKey, data)
      }

      return data
    },
  }
}
