import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHttpClient, type HttpClient } from '../../../src/registry/http.js'
import { createCache, type Cache } from '../../../src/registry/cache.js'

const mockFetch = vi.fn()

const TEST_URL = 'https://registry.npmjs.org/lodash'
const TEST_URL_2 = 'https://registry.npmjs.org/lodash2'
const EXTERNAL_URL = 'https://crates.io/api/v1/crates/serde'

describe('HttpClient', () => {
  let client: HttpClient
  let cache: Cache

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    await cache.clear()
    client = createHttpClient({
      cache,
      rateLimitPerSecond: 100,
      timeoutMs: 5000,
      maxAttempts: 3,
      retryBaseDelayMs: 1, // 1ms in tests — no meaningful wait
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  describe('successful fetch', () => {
    it('fetches and returns parsed JSON as unknown', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'lodash' }), { status: 200 })
      )

      const result = await client.fetchJson(TEST_URL)
      expect(result).toEqual({ name: 'lodash' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns cached result on second call — no second fetch', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'lodash' }), { status: 200 })
      )

      await client.fetchJson(TEST_URL)
      const result = await client.fetchJson(TEST_URL)

      expect(result).toEqual({ name: 'lodash' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does not cache authenticated requests', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ private: true }), { status: 200 }))

      const opts = { headers: { Authorization: 'Bearer token123' } }
      await client.fetchJson('https://api.github.com/repos/foo/bar', opts)
      await client.fetchJson('https://api.github.com/repos/foo/bar', opts)

      expect(mockFetch).toHaveBeenCalledTimes(2) // no cache for authenticated
    })
  })

  describe('retry behaviour', () => {
    it('retries on 500 and succeeds on second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'lodash' }), { status: 200 }))

      const result = await client.fetchJson(TEST_URL_2)
      expect(result).toEqual({ name: 'lodash' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retries on 429 and succeeds on second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Rate Limited', { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

      const result = await client.fetchJson(EXTERNAL_URL)
      expect(result).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws after exhausting all attempts (maxAttempts=3 means 3 total calls)', async () => {
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }))

      await expect(
        client.fetchJson('https://registry.npmjs.org/broken')
      ).rejects.toThrow()

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('no-retry on client errors', () => {
    it('throws immediately on 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      await expect(
        client.fetchJson('https://registry.npmjs.org/nonexistent')
      ).rejects.toThrow(/404/)

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('throws immediately on 400', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }))

      await expect(
        client.fetchJson('https://api.osv.dev/bad')
      ).rejects.toThrow(/400/)

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('URL validation (SSRF prevention)', () => {
    it('throws on non-https URL', async () => {
      await expect(
        client.fetchJson('http://registry.npmjs.org/lodash')
      ).rejects.toThrow(/HTTPS/)
    })

    it('throws on disallowed host', async () => {
      await expect(
        client.fetchJson('https://evil.com/steal-data')
      ).rejects.toThrow(/allowlist/)
    })

    it('throws on invalid URL', async () => {
      await expect(
        client.fetchJson('not-a-url')
      ).rejects.toThrow(/Invalid URL/)
    })
  })

  describe('JSON parse error handling', () => {
    it('throws a descriptive error when response body is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('<html>Error page</html>', { status: 200 })
      )

      await expect(
        client.fetchJson(TEST_URL)
      ).rejects.toThrow(/Failed to parse JSON/)
    })
  })
})
