import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NpmRegistryClient } from '../../../src/registry/npm.js'
import { createCache } from '../../../src/registry/cache.js'
import { createHttpClient } from '../../../src/registry/http.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { Cache } from '../../../src/registry/cache.js'

const mockFetch = vi.fn()

// Minimal npm registry response for lodash
const NPM_LODASH_RESPONSE = {
  name: 'lodash',
  description: 'Lodash modular utilities.',
  'dist-tags': { latest: '4.17.21' },
  versions: {
    '4.17.21': {
      name: 'lodash',
      version: '4.17.21',
      description: 'Lodash modular utilities.',
      license: 'MIT',
      repository: { url: 'https://github.com/lodash/lodash' },
      maintainers: [{ name: 'jdalton', email: 'john.david.dalton@gmail.com' }],
    },
  },
  time: {
    '4.17.21': '2021-02-20T00:00:00.000Z',
  },
  maintainers: [{ name: 'jdalton', email: 'john.david.dalton@gmail.com' }],
  license: 'MIT',
  repository: { url: 'https://github.com/lodash/lodash' },
  homepage: 'https://lodash.com/',
}

const NPM_DOWNLOADS_RESPONSE = {
  downloads: 50_000_000,
  package: 'lodash',
  start: '2024-01-01',
  end: '2024-01-07',
}

describe('NpmRegistryClient', () => {
  let cache: Cache
  let client: NpmRegistryClient

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
    client = new NpmRegistryClient(http)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  it('has the correct ecosystem', () => {
    expect(client.ecosystem).toBe(Ecosystem.nodejs)
  })

  describe('getPackageMetadata', () => {
    it('fetches and returns package metadata', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NPM_LODASH_RESPONSE), { status: 200 })
      )
      const meta = await client.getPackageMetadata('lodash')
      expect(meta.license).toBe('MIT')
      expect(meta.description).toBe('Lodash modular utilities.')
      expect(meta.repositoryUrl).toBe('https://github.com/lodash/lodash')
    })

    it('extracts maintainers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NPM_LODASH_RESPONSE), { status: 200 })
      )
      const meta = await client.getPackageMetadata('lodash')
      expect(meta.maintainers).toHaveLength(1)
      expect(meta.maintainers[0].name).toBe('jdalton')
    })

    it('extracts last publish date', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NPM_LODASH_RESPONSE), { status: 200 })
      )
      const meta = await client.getPackageMetadata('lodash')
      expect(meta.lastPublishDate).toBeInstanceOf(Date)
    })

    it('returns null for missing optional fields on unknown package', async () => {
      const minimal = { name: 'minimal-pkg', 'dist-tags': { latest: '1.0.0' }, versions: {}, time: {}, maintainers: [] }
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(minimal), { status: 200 })
      )
      const meta = await client.getPackageMetadata('minimal-pkg')
      expect(meta.license).toBeNull()
      expect(meta.repositoryUrl).toBeNull()
      expect(meta.lastPublishDate).toBeNull()
    })

    it('throws on 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      await expect(client.getPackageMetadata('nonexistent-pkg-xyz')).rejects.toThrow()
    })
  })

  describe('getPackageMaintainers', () => {
    it('returns maintainer list', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NPM_LODASH_RESPONSE), { status: 200 })
      )
      const maintainers = await client.getPackageMaintainers('lodash')
      expect(maintainers[0].name).toBe('jdalton')
      expect(maintainers[0].email).toBe('john.david.dalton@gmail.com')
    })
  })

  describe('getDownloadCount', () => {
    it('returns weekly download count', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH_RESPONSE), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(NPM_DOWNLOADS_RESPONSE), { status: 200 }))
      await client.getPackageMetadata('lodash') // prime cache
      const count = await client.getDownloadCount('lodash')
      expect(count).toBe(50_000_000)
    })

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      const count = await client.getDownloadCount('nonexistent-xyz')
      expect(count).toBeNull()
    })
  })

  describe('scoped package URL encoding', () => {
    const SCOPED_RESPONSE = {
      name: '@types/node',
      description: 'TypeScript definitions for node',
      'dist-tags': { latest: '20.0.0' },
      time: { '20.0.0': '2023-01-01T00:00:00.000Z' },
      maintainers: [{ name: 'types' }],
      license: 'MIT',
    }

    it('encodes scoped package name correctly — @ literal, / percent-encoded', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(SCOPED_RESPONSE), { status: 200 })
      )
      await client.getPackageMetadata('@types/node')
      const calledUrl = mockFetch.mock.calls[0][0] as string
      // Must NOT be %40types%2Fnode (fully encoded)
      expect(calledUrl).not.toContain('%40types%2Fnode')
      // Must be @types%2Fnode
      expect(calledUrl).toContain('@types%2Fnode')
    })

    it('fetches metadata for a scoped package without error', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(SCOPED_RESPONSE), { status: 200 })
      )
      const meta = await client.getPackageMetadata('@types/node')
      expect(meta.license).toBe('MIT')
    })
  })
})
