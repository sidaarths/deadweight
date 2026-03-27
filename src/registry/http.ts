import pLimit from 'p-limit'
import type { Cache } from './cache.js'

export interface HttpClientOptions {
  cache: Cache
  rateLimitPerSecond: number
  timeoutMs?: number
  maxRetries?: number
}

export interface HttpClient {
  fetchJson<T>(url: string, options?: RequestInit): Promise<T>
}

// Status codes that should NOT be retried
const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 422])

// Status codes that ARE retried
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    cache,
    rateLimitPerSecond,
    timeoutMs = 10_000,
    maxRetries = 3,
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
      throw new Error(`HTTP ${response.status} for ${url}`)
    }

    if (RETRY_STATUSES.has(response.status) && attempt < maxRetries) {
      // Exponential backoff: 100ms, 200ms, 400ms (kept short for tests)
      await delay(100 * 2 ** (attempt - 1))
      return fetchWithRetry(url, init, attempt + 1)
    }

    throw new Error(`HTTP ${response.status} after ${attempt} attempt(s) for ${url}`)
  }

  return {
    async fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
      const cacheKey = `http:${url}`
      const cached = await cache.get<T>(cacheKey)
      if (cached !== undefined) return cached

      const response = await limit(() => fetchWithRetry(url, init, 1))
      const data = (await response.json()) as T
      await cache.set(cacheKey, data)
      return data
    },
  }
}
