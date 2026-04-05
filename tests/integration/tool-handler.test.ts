/**
 * Journey 2: Tool handler integration
 *
 * Exercises the tool handler directly (bypassing MCP transport). Schema
 * validation, file I/O, and the full parse→resolve pipeline are all real.
 * Only `fetch` is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCache } from '../../src/registry/cache.js'
import { createHttpClient } from '../../src/registry/http.js'
import { NpmRegistryClient } from '../../src/registry/npm.js'
import { createTreeResolver } from '../../src/analysis/tree-resolver.js'
import { createAnalyzeDependencyTreeTool } from '../../src/tools/analyze-dependency-tree.js'
import { AnalyzeDependencyTreeSchema } from '../../src/types/index.js'
import type { Cache } from '../../src/registry/cache.js'
import type { DependencyNode } from '../../src/types/index.js'

const FIXTURES = join(import.meta.dirname, '../fixtures/nodejs')

// ---------------------------------------------------------------------------
// Realistic npm mock responses (kept minimal — shape is what matters here)
// ---------------------------------------------------------------------------
const NPM_LODASH = {
  name: 'lodash',
  description: 'Lodash',
  license: 'MIT',
  repository: { url: 'https://github.com/lodash/lodash' },
  maintainers: [{ name: 'jdalton', email: 'jdalton@example.com' }],
  time: { '4.17.21': '2021-02-20T00:00:00.000Z' },
  'dist-tags': { latest: '4.17.21' },
}

const NPM_EXPRESS = {
  name: 'express',
  description: 'Express',
  license: 'MIT',
  repository: { url: 'https://github.com/expressjs/express' },
  maintainers: [{ name: 'dougwilson' }],
  time: { '4.18.2': '2022-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '4.18.2' },
}

const NPM_ACCEPTS = {
  name: 'accepts',
  description: 'Accepts',
  license: 'MIT',
  repository: null,
  maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': '2022-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '1.3.8' },
}

const NPM_TYPESCRIPT = {
  name: 'typescript',
  description: 'TypeScript',
  license: 'Apache-2.0',
  repository: { url: 'https://github.com/microsoft/TypeScript' },
  maintainers: [{ name: 'typescript' }],
  time: { '5.2.2': '2023-01-01T00:00:00.000Z' },
  'dist-tags': { latest: '5.2.2' },
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>
let cache: Cache
let tool: ReturnType<typeof createAnalyzeDependencyTreeTool>
let tmpDir: string

async function setupStack() {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
  const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
  const npmClient = new NpmRegistryClient(http)
  const resolver = createTreeResolver({ registryClients: [npmClient] })
  tool = createAnalyzeDependencyTreeTool(resolver)
  tmpDir = join(tmpdir(), `deadweight-handler-test-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  process.env['DEADWEIGHT_ROOT'] = tmpDir
}

function mockAllNpm() {
  // URL-based dispatch: correct data regardless of fetch call order
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/lodash')) return Promise.resolve(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
    if (url.includes('/express')) return Promise.resolve(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
    if (url.includes('/accepts')) return Promise.resolve(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
    if (url.includes('/typescript')) return Promise.resolve(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Journey 2: Tool handler integration', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    delete process.env['DEADWEIGHT_ROOT']
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
    await rm(tmpDir, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------------
  // 1. Schema rejects missing path and content
  // -------------------------------------------------------------------------
  describe('1. Schema validation', () => {
    it('rejects input with neither path nor content', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects input with both path and content set', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({
        path: '/some/file.json',
        content: '{"name":"x"}',
      })
      expect(result.success).toBe(false)
    })

    it('accepts input with only path', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({ path: '/some/file.json' })
      expect(result.success).toBe(true)
    })

    it('accepts input with only content', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({ content: '{"name":"x"}' })
      expect(result.success).toBe(true)
    })

    it('handler throws when passed invalid input (empty object)', async () => {
      // The handler's inputSchema is the Zod schema; calling with an empty
      // object will fail at the tool layer (Zod validation or file-read error).
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tool.handler({} as any),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // 2. Handler reads from file path
  // -------------------------------------------------------------------------
  describe('2. Handler reads from file path', () => {
    it('reads and processes lockfile from a real file path', async () => {
      mockAllNpm()
      const lockfilePath = join(tmpDir, 'package-lock.json')
      const lockfileContent = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      await writeFile(lockfilePath, lockfileContent, 'utf-8')

      const result = await tool.handler({ path: lockfilePath, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
      expect(result.totalDirect).toBe(2)
    })

    it('reads and processes package.json from a real file path', async () => {
      const pkgPath = join(tmpDir, 'package.json')
      const pkgContent = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      await writeFile(pkgPath, pkgContent, 'utf-8')

      const result = await tool.handler({ path: pkgPath, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
    })

    it('throws when file does not exist at given path', async () => {
      await expect(
        tool.handler({ path: join(tmpDir, 'nonexistent.json'), includeDevDependencies: false }),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // 3. Handler reads from inline content
  // -------------------------------------------------------------------------
  describe('3. Handler reads from inline content', () => {
    it('processes lockfile JSON passed as content string', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
    })

    it('processes package.json JSON passed as content string', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.ecosystem).toBe('nodejs')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Output shape is correct
  // -------------------------------------------------------------------------
  describe('4. Output shape', () => {
    it('returned object has all required top-level fields', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })

      expect(result).toHaveProperty('ecosystem')
      expect(result).toHaveProperty('manifestPath')
      expect(result).toHaveProperty('totalDirect')
      expect(result).toHaveProperty('totalTransitive')
      expect(result).toHaveProperty('resolvedAt')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('root')
    })

    it('resolvedAt is a valid ISO 8601 date string', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(typeof result.resolvedAt).toBe('string')
      const parsed = new Date(result.resolvedAt)
      expect(parsed.getTime()).not.toBeNaN()
    })

    it('warnings is an array', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(Array.isArray(result.warnings)).toBe(true)
    })

    it('totalDirect and totalTransitive are non-negative integers', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(typeof result.totalDirect).toBe('number')
      expect(typeof result.totalTransitive).toBe('number')
      expect(result.totalDirect).toBeGreaterThanOrEqual(0)
      expect(result.totalTransitive).toBeGreaterThanOrEqual(0)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Root node has correct structure
  // -------------------------------------------------------------------------
  describe('5. Root node structure', () => {
    it('root.name matches the package name in the lockfile', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.root.name).toBe('test-app')
    })

    it('root.depth is 0', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.root.depth).toBe(0)
    })

    it('root.dependencies is an array', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(Array.isArray(result.root.dependencies)).toBe(true)
    })

    it('root.directDependency is false', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.root.directDependency).toBe(false)
    })

    it('direct child nodes have depth === 1', async () => {
      mockAllNpm()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      for (const dep of result.root.dependencies) {
        expect((dep as { depth: number }).depth).toBe(1)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 6. Depth guard — serializeNode stops at depth 50
  // -------------------------------------------------------------------------
  describe('6. Depth guard in serializeNode', () => {
    it('stops serializing children at depth 50 (no infinite recursion)', async () => {
      // Build an artificially deep DependencyNode chain programmatically.
      // We inject it by calling the tool's resolver with a fabricated tree-resolver
      // that returns a deeply nested node without real network calls.
      const DEEP = 55

      // Build deep node bottom-up
      let deepNode: DependencyNode = {
        name: `dep-depth-${DEEP}`,
        version: '1.0.0',
        ecosystem: 'nodejs' as const,
        directDependency: false,
        depth: DEEP,
        dependencies: [],
      }

      for (let d = DEEP - 1; d >= 1; d--) {
        deepNode = {
          name: `dep-depth-${d}`,
          version: '1.0.0',
          ecosystem: 'nodejs' as const,
          directDependency: d === 1,
          depth: d,
          dependencies: [deepNode],
        }
      }

      // Inject a fake tree resolver that returns our deep tree
      const fakeResolver = {
        async resolve() {
          return {
            root: {
              name: 'root',
              version: '1.0.0',
              ecosystem: 'nodejs' as const,
              directDependency: false,
              depth: 0,
              dependencies: [deepNode],
            },
            ecosystem: 'nodejs' as const,
            manifestPath: 'fake',
            totalDirect: 1,
            totalTransitive: DEEP - 1,
            resolvedAt: new Date(),
            warnings: [],
          }
        },
      }

      const deepTool = createAnalyzeDependencyTreeTool(fakeResolver)
      const result = await deepTool.handler({ content: '{}', includeDevDependencies: false })

      // Walk the serialized tree to measure actual max depth reached
      function measureDepth(node: unknown, d = 0): number {
        const n = node as { dependencies?: unknown[] }
        if (!n.dependencies || n.dependencies.length === 0) return d
        return Math.max(...n.dependencies.map((child: unknown) => measureDepth(child, d + 1)))
      }

      const serializedDepth = measureDepth(result.root)
      // serializeNode uses MAX_SERIALIZE_DEPTH = 50; so from depth-0 root,
      // children at currentDepth < 50 are serialized. Depth-50 node gets
      // an empty dependencies array. Maximum child depth reachable is 50.
      expect(serializedDepth).toBeLessThanOrEqual(50)
    })
  })
})
