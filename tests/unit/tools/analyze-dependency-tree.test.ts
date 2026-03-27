import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAnalyzeDependencyTreeTool } from '../../../src/tools/analyze-dependency-tree.js'
import { createTreeResolver } from '../../../src/analysis/tree-resolver.js'
import { createCache } from '../../../src/registry/cache.js'
import { createHttpClient } from '../../../src/registry/http.js'
import { NpmRegistryClient } from '../../../src/registry/npm.js'
import type { Cache } from '../../../src/registry/cache.js'
import { readFileSync } from 'node:fs'

// mockFetch is created fresh in beforeEach to avoid bleed between parallel test files
let mockFetch: ReturnType<typeof vi.fn>
const FIXTURES = join(import.meta.dirname, '../../fixtures/nodejs')

const NPM_LODASH = {
  name: 'lodash', description: 'Lodash', license: 'MIT',
  repository: { url: 'https://github.com/lodash/lodash' },
  maintainers: [{ name: 'jdalton', email: 'jdalton@example.com' }],
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

describe('createAnalyzeDependencyTreeTool', () => {
  let cache: Cache
  let tool: ReturnType<typeof createAnalyzeDependencyTreeTool>
  let tmpDir: string

  beforeEach(async () => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
    const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
    const npmClient = new NpmRegistryClient(http)
    const resolver = createTreeResolver({ registryClients: [npmClient] })
    tool = createAnalyzeDependencyTreeTool(resolver)
    tmpDir = join(tmpdir(), `deadweight-test-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
    await rm(tmpDir, { recursive: true, force: true })
  })

  function mockAllNpm() {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
  }

  it('has the correct tool name', () => {
    expect(tool.name).toBe('analyze_dependency_tree')
  })

  it('has a description', () => {
    expect(tool.description.length).toBeGreaterThan(10)
  })

  describe('handler with content input', () => {
    it('returns ecosystem and counts when given lockfile content', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
      expect(result.totalDirect).toBe(2)
      expect(result.totalTransitive).toBeGreaterThanOrEqual(1)
    })

    it('returns a resolvedAt ISO string', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(typeof result.resolvedAt).toBe('string')
      expect(() => new Date(result.resolvedAt)).not.toThrow()
    })

    it('serializes root node with dependencies', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.root).toBeDefined()
      expect(result.root.name).toBe('test-app')
      expect(Array.isArray(result.root.dependencies)).toBe(true)
    })

    it('serializes registry metadata on dependency nodes', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const lodash = result.root.dependencies.find((d: { name: string }) => d.name === 'lodash')
      expect(lodash?.registryMetadata?.license).toBe('MIT')
      expect(lodash?.registryMetadata?.maintainers[0].name).toBe('jdalton')
    })

    it('serializes null lastPublishDate when not available', async () => {
      // Use minimal response without time entry
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          name: 'lodash', 'dist-tags': { latest: '4.17.21' }, versions: {}, time: {}, maintainers: [],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          name: 'express', 'dist-tags': { latest: '4.18.2' }, versions: {}, time: {}, maintainers: [],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          name: 'accepts', 'dist-tags': { latest: '1.3.8' }, versions: {}, time: {}, maintainers: [],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          name: 'typescript', 'dist-tags': { latest: '5.2.2' }, versions: {}, time: {}, maintainers: [],
        }), { status: 200 }))

      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const lodash = result.root.dependencies.find((d: { name: string }) => d.name === 'lodash')
      expect(lodash?.registryMetadata?.lastPublishDate).toBeNull()
    })
  })

  describe('handler with file path input', () => {
    it('reads manifest from file path and resolves tree', async () => {
      mockAllNpm()
      const lockfilePath = join(tmpDir, 'package-lock.json')
      const lockfileContent = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      await writeFile(lockfilePath, lockfileContent, 'utf-8')

      const result = await tool.handler({ path: lockfilePath, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
      expect(result.totalDirect).toBe(2)
    })

    it('throws when file does not exist', async () => {
      await expect(
        tool.handler({ path: join(tmpDir, 'nonexistent.json'), includeDevDependencies: false })
      ).rejects.toThrow()
    })
  })

  describe('includeDevDependencies', () => {
    it('includes dev dependencies when flag is true', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: true })
      // With devDeps, totalDirect should be 3 (lodash, express, typescript)
      expect(result.totalDirect).toBe(3)
    })
  })
})
