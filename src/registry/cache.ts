import Keyv from 'keyv'
import KeyvSqlite from '@keyv/sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export interface Cache {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  clear(): Promise<void>
}

export interface CacheOptions {
  dir: string
  ttlSeconds: number
}

export async function createCache(options: CacheOptions): Promise<Cache> {
  const uri =
    options.dir === ':memory:'
      ? 'sqlite://:memory:'
      : (() => {
          mkdirSync(options.dir, { recursive: true })
          return `sqlite://${join(options.dir, 'deadweight.db')}`
        })()

  const store = new KeyvSqlite(uri)
  const keyv = new Keyv(store, { ttl: options.ttlSeconds * 1000 })

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return keyv.get<T>(key)
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds !== undefined ? ttlSeconds * 1000 : undefined
      await keyv.set(key, value, ttl)
    },
    async clear(): Promise<void> {
      await keyv.clear()
    },
  }
}
