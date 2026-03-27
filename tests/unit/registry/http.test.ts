import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHttpClient, type HttpClient } from '../../../src/registry/http.js'
import { createCache } from '../../../src/registry/cache.js'

// We mock global fetch
const mockFetch = vi.fn()

describe('HttpClient', () => {
  let client: HttpClient

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    const cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    await cache.clear()
    client = createHttpClient({ cache, rateLimitPerSecond: 100, timeoutMs: 5000, maxRetries: 3 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and parses JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'lodash' }), { status: 200 })
    )

    const result = await client.fetchJson<{ name: string }>('https://registry.npmjs.org/lodash')
    expect(result).toEqual({ name: 'lodash' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns cached result on second call (no second fetch)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'lodash' }), { status: 200 })
    )

    await client.fetchJson('https://registry.npmjs.org/lodash')
    const result = await client.fetchJson('https://registry.npmjs.org/lodash')

    expect(result).toEqual({ name: 'lodash' })
    expect(mockFetch).toHaveBeenCalledTimes(1) // second call was served from cache
  })

  it('retries on 500 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'lodash' }), { status: 200 }))

    const result = await client.fetchJson<{ name: string }>('https://registry.npmjs.org/lodash2')
    expect(result).toEqual({ name: 'lodash' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Rate Limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await client.fetchJson<{ ok: boolean }>('https://example.com/api')
    expect(result).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting all retries', async () => {
    mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }))

    await expect(
      client.fetchJson('https://registry.npmjs.org/broken')
    ).rejects.toThrow()

    expect(mockFetch).toHaveBeenCalledTimes(3) // maxRetries = 3
  })

  it('throws immediately on 404 (no retry)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

    await expect(
      client.fetchJson('https://registry.npmjs.org/nonexistent')
    ).rejects.toThrow(/404/)

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws immediately on 400 (no retry)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }))

    await expect(
      client.fetchJson('https://example.com/bad')
    ).rejects.toThrow(/400/)

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
