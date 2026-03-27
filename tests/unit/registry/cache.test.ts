import { describe, it, expect, beforeEach } from 'vitest'
import { createCache, type Cache } from '../../../src/registry/cache.js'

describe('Cache', () => {
  let cache: Cache

  beforeEach(async () => {
    // Use in-memory SQLite (no file path) for test isolation
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    await cache.clear()
  })

  it('returns undefined for a cache miss', async () => {
    const result = await cache.get<string>('test:missing')
    expect(result).toBeUndefined()
  })

  it('stores and retrieves a value', async () => {
    await cache.set('test:key', { value: 42 })
    const result = await cache.get<{ value: number }>('test:key')
    expect(result).toEqual({ value: 42 })
  })

  it('stores and retrieves a string value', async () => {
    await cache.set('test:string', 'hello')
    const result = await cache.get<string>('test:string')
    expect(result).toBe('hello')
  })

  it('stores and retrieves an array', async () => {
    await cache.set('test:arr', [1, 2, 3])
    const result = await cache.get<number[]>('test:arr')
    expect(result).toEqual([1, 2, 3])
  })

  it('clear removes all entries', async () => {
    await cache.set('test:a', 'alpha')
    await cache.set('test:b', 'beta')
    await cache.clear()
    expect(await cache.get('test:a')).toBeUndefined()
    expect(await cache.get('test:b')).toBeUndefined()
  })

  it('accepts a per-entry TTL override', async () => {
    // Just verifies it does not throw — TTL expiry is not testable synchronously
    await expect(cache.set('test:ttl', 'value', 120)).resolves.not.toThrow()
  })

  it('handles null values gracefully', async () => {
    await cache.set('test:null', null)
    const result = await cache.get<null>('test:null')
    expect(result).toBeNull()
  })
})
