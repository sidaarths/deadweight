import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, DEFAULT_CONFIG } from '../../src/config.js'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns defaults when no env vars are set', () => {
    delete process.env.GITHUB_TOKEN
    delete process.env.LIBRARIES_IO_API_KEY
    delete process.env.DEADWEIGHT_CACHE_DIR
    delete process.env.DEADWEIGHT_CACHE_TTL
    delete process.env.DEADWEIGHT_RATE_LIMIT

    const config = loadConfig()

    expect(config.githubToken).toBeUndefined()
    expect(config.librariesIoApiKey).toBeUndefined()
    expect(config.cacheDir).toBe(DEFAULT_CONFIG.cacheDir)
    expect(config.cacheTtlSeconds).toBe(DEFAULT_CONFIG.cacheTtlSeconds)
    expect(config.rateLimitPerSecond).toBe(DEFAULT_CONFIG.rateLimitPerSecond)
  })

  it('reads GITHUB_TOKEN from environment', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    const config = loadConfig()
    expect(config.githubToken).toBe('ghp_test123')
  })

  it('reads LIBRARIES_IO_API_KEY from environment', () => {
    process.env.LIBRARIES_IO_API_KEY = 'lib_key_abc'
    const config = loadConfig()
    expect(config.librariesIoApiKey).toBe('lib_key_abc')
  })

  it('reads and parses DEADWEIGHT_CACHE_TTL as number', () => {
    process.env.DEADWEIGHT_CACHE_TTL = '7200'
    const config = loadConfig()
    expect(config.cacheTtlSeconds).toBe(7200)
  })

  it('reads and parses DEADWEIGHT_RATE_LIMIT as number', () => {
    process.env.DEADWEIGHT_RATE_LIMIT = '5'
    const config = loadConfig()
    expect(config.rateLimitPerSecond).toBe(5)
  })

  it('reads DEADWEIGHT_CACHE_DIR from environment', () => {
    process.env.DEADWEIGHT_CACHE_DIR = '/tmp/test-cache'
    const config = loadConfig()
    expect(config.cacheDir).toBe('/tmp/test-cache')
  })

  it('throws on invalid DEADWEIGHT_CACHE_TTL (non-numeric)', () => {
    process.env.DEADWEIGHT_CACHE_TTL = 'not-a-number'
    expect(() => loadConfig()).toThrow()
  })

  it('throws on invalid DEADWEIGHT_RATE_LIMIT (zero)', () => {
    process.env.DEADWEIGHT_RATE_LIMIT = '0'
    expect(() => loadConfig()).toThrow()
  })

  it('throws on invalid DEADWEIGHT_RATE_LIMIT (negative)', () => {
    process.env.DEADWEIGHT_RATE_LIMIT = '-5'
    expect(() => loadConfig()).toThrow()
  })
})
