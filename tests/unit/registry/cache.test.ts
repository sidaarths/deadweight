import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCache, type Cache } from '../../../src/registry/cache.js'

describe('Cache', () => {
  let cache: Cache

  beforeEach(async () => {
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    await cache.clear()
  })

  afterEach(async () => {
    await cache.close()
  })

  it('returns undefined for a cache miss', async () => {
    const result = await cache.get<string>('test:missing')
    expect(result).toBeUndefined()
  })

  it('stores and retrieves an object', async () => {
    await cache.set('test:key', { value: 42 })
    const result = await cache.get<{ value: number }>('test:key')
    expect(result).toEqual({ value: 42 })
  })

  it('stores and retrieves a string', async () => {
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

  it('accepts a per-entry TTL override without throwing', async () => {
    await expect(cache.set('test:ttl', 'value', 120)).resolves.not.toThrow()
  })

  it('stores and retrieves null as a valid value (distinct from cache miss)', async () => {
    await cache.set('test:null', null)
    const result = await cache.get<null>('test:null')
    expect(result).toBeNull()
  })

  it('close does not throw', async () => {
    await expect(cache.close()).resolves.not.toThrow()
  })
})

describe('Cache (file-backed)', () => {
  let tmpDir: string
  let cache: Cache

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deadweight-test-'))
    cache = await createCache({ dir: tmpDir, ttlSeconds: 60 })
  })

  afterEach(async () => {
    await cache.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates the cache directory and stores/retrieves a value', async () => {
    await cache.set('file:key', { ok: true })
    const result = await cache.get<{ ok: boolean }>('file:key')
    expect(result).toEqual({ ok: true })
  })
})
