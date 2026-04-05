import Keyv from 'keyv'
import KeyvSqlite from '@keyv/sqlite'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const MS_PER_SECOND = 1000

export interface Cache {
  get<T>(key: string): Promise<T | undefined>
  /**
   * Store a value. `null` is a valid storable value distinct from a cache miss
   * (which returns `undefined`). Do not store `undefined` — use `clear` or let entries expire.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  clear(): Promise<void>
  close(): Promise<void>
}

interface CacheOptions {
  dir: string
  ttlSeconds: number
}

export async function createCache(options: CacheOptions): Promise<Cache> {
  let uri: string
  if (options.dir === ':memory:') {
    uri = 'sqlite://:memory:'
  } else {
    await mkdir(options.dir, { recursive: true })
    uri = `sqlite://${join(options.dir, 'deadweight.db')}`
  }

  const store = new KeyvSqlite(uri)
  const keyv = new Keyv(store, { ttl: options.ttlSeconds * MS_PER_SECOND })
  let closed = false

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return keyv.get<T>(key)
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds !== undefined ? ttlSeconds * MS_PER_SECOND : undefined
      await keyv.set(key, value, ttl)
    },
    async clear(): Promise<void> {
      await keyv.clear()
    },
    async close(): Promise<void> {
      if (closed) return
      closed = true
      await keyv.disconnect()
    },
  }
}
