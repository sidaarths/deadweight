import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTreeResolver } from '../../../src/analysis/tree-resolver.js'
import { createCache } from '../../../src/registry/cache.js'
import { createHttpClient } from '../../../src/registry/http.js'
import { NpmRegistryClient } from '../../../src/registry/npm.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { Cache } from '../../../src/registry/cache.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockFetch = vi.fn()
const FIXTURES = join(import.meta.dirname, '../../fixtures/nodejs')

const NPM_LODASH = {
  name: 'lodash', description: 'Lodash', license: 'MIT',
  repository: { url: 'https://github.com/lodash/lodash' },
  maintainers: [{ name: 'jdalton' }],
  time: { '4.17.21': '2021-02-20T00:00:00.000Z' },
  'dist-tags': { latest: '4.17.21' },
}
const NPM_EXPRESS = {
  name: 'express', description: 'Express', license: 'MIT',
  repository: { url: 'https://github.com/expressjs/express' },
  maintainers: [{ name: 'dougwilson' }],
  time: { '4.18.2': '2022-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '4.18.2' },
}
const NPM_ACCEPTS = {
  name: 'accepts', description: 'Accepts', license: 'MIT',
  repository: null, maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': '2022-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '1.3.8' },
}
const NPM_TYPESCRIPT = {
  name: 'typescript', description: 'TypeScript', license: 'Apache-2.0',
  repository: { url: 'https://github.com/microsoft/typescript' },
  maintainers: [{ name: 'typescript' }],
  time: { '5.2.2': '2023-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '5.2.2' },
}

describe('TreeResolver', () => {
  let cache: Cache
  let resolver: ReturnType<typeof createTreeResolver>

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
    const npmClient = new NpmRegistryClient(http)
    resolver = createTreeResolver({ registryClients: [npmClient] })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  function mockNpmResponses() {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
  }

  it('resolves ecosystem from file path', async () => {
    mockNpmResponses()
    const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
    const tree = await resolver.resolve({
      content,
      filePath: '/project/package-lock.json',
    })
    expect(tree.ecosystem).toBe(Ecosystem.nodejs)
  })

  it('builds a tree with the correct root', async () => {
    mockNpmResponses()
    const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
    const tree = await resolver.resolve({ content, filePath: '/project/package-lock.json' })
    expect(tree.root.name).toBe('test-app')
    expect(tree.root.depth).toBe(0)
  })

  it('counts direct and transitive dependencies', async () => {
    mockNpmResponses()
    const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
    const tree = await resolver.resolve({ content, filePath: '/project/package-lock.json' })
    // 2 direct runtime deps (lodash, express), 1 transitive (accepts), 1 dev (typescript)
    expect(tree.totalDirect).toBe(2)
    expect(tree.totalTransitive).toBeGreaterThanOrEqual(1)
  })

  it('enriches nodes with registry metadata', async () => {
    mockNpmResponses()
    const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
    const tree = await resolver.resolve({ content, filePath: '/project/package-lock.json' })
    const lodash = tree.root.dependencies.find(d => d.name === 'lodash')
    expect(lodash?.registryMetadata?.license).toBe('MIT')
  })

  it('throws when ecosystem cannot be detected', async () => {
    await expect(
      resolver.resolve({ content: 'random text', filePath: '/project/unknown.xyz' })
    ).rejects.toThrow(/ecosystem/)
  })

  it('surfaces registry failures as warnings on the tree', async () => {
    // Only mock the first fetch to succeed; others return 500 → registry warning
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
      .mockResolvedValue(new Response('Server Error', { status: 500 }))

    const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
    const tree = await resolver.resolve({ content, filePath: '/project/package-lock.json' })

    // Tree still resolves (no throw)
    expect(tree).toBeDefined()
    // Registry failures appear as warnings
    const registryWarnings = tree.warnings.filter(w => w.includes('Registry lookup failed'))
    expect(registryWarnings.length).toBeGreaterThan(0)
  })
})
