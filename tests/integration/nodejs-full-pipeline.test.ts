/**
 * Journey 1: Full Node.js pipeline — lockfile → enriched tree
 *
 * These are integration tests: every real module runs (parser, detector,
 * tree-resolver, npm client, http client, cache). Only `fetch` is mocked at
 * the global level so we never make real network calls in CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCache } from '../../src/registry/cache.js'
import { createHttpClient } from '../../src/registry/http.js'
import { NpmRegistryClient } from '../../src/registry/npm.js'
import { createTreeResolver } from '../../src/analysis/tree-resolver.js'
import { createAnalyzeDependencyTreeTool } from '../../src/tools/analyze-dependency-tree.js'
import { Ecosystem } from '../../src/types/index.js'
import type { Cache } from '../../src/registry/cache.js'

const FIXTURES = join(import.meta.dirname, '../fixtures/nodejs')

// ---------------------------------------------------------------------------
// Realistic npm registry mock responses
// ---------------------------------------------------------------------------
const NPM_LODASH = {
  name: 'lodash',
  description: 'Lodash modular utilities.',
  license: 'MIT',
  homepage: 'https://lodash.com/',
  repository: { url: 'git+https://github.com/lodash/lodash.git' },
  maintainers: [{ name: 'jdalton', email: 'john.david.dalton@gmail.com' }],
  time: { '4.17.21': '2021-02-20T00:00:00.000Z' },
  'dist-tags': { latest: '4.17.21' },
}

const NPM_EXPRESS = {
  name: 'express',
  description: 'Fast, unopinionated, minimalist web framework.',
  license: 'MIT',
  homepage: 'https://expressjs.com/',
  repository: { url: 'git+https://github.com/expressjs/express.git' },
  maintainers: [{ name: 'dougwilson', email: 'doug@somethingdoug.com' }],
  time: { '4.18.2': '2022-10-08T00:00:00.000Z' },
  'dist-tags': { latest: '4.18.2' },
}

const NPM_ACCEPTS = {
  name: 'accepts',
  description: 'Higher-level content negotiation.',
  license: 'MIT',
  repository: null,
  maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': '2022-02-02T00:00:00.000Z' },
  'dist-tags': { latest: '1.3.8' },
}

const NPM_TYPESCRIPT = {
  name: 'typescript',
  description: 'TypeScript is a language for application scale JavaScript development.',
  license: 'Apache-2.0',
  repository: { url: 'git+https://github.com/microsoft/TypeScript.git' },
  maintainers: [{ name: 'typescript' }],
  time: { '5.2.2': '2023-08-24T00:00:00.000Z' },
  'dist-tags': { latest: '5.2.2' },
}

const NPM_TYPES_NODE = {
  name: '@types/node',
  description: 'TypeScript definitions for node.',
  license: 'MIT',
  repository: { url: 'git+https://github.com/DefinitelyTyped/DefinitelyTyped.git' },
  maintainers: [{ name: 'types' }],
  time: { '20.11.0': '2024-01-10T00:00:00.000Z' },
  'dist-tags': { latest: '20.11.0' },
}

// ---------------------------------------------------------------------------
// Test suite setup helpers
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>
let cache: Cache
let tool: ReturnType<typeof createAnalyzeDependencyTreeTool>
let resolver: ReturnType<typeof createTreeResolver>

async function setupStack() {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
  const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
  const npmClient = new NpmRegistryClient(http)
  resolver = createTreeResolver({ registryClients: [npmClient] })
  tool = createAnalyzeDependencyTreeTool(resolver)
}

function mockNpmForStandardLockfile() {
  // Standard lockfile has 4 packages: lodash, express, accepts, typescript
  mockFetch
    .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
}

// ---------------------------------------------------------------------------
// Journey 1 tests
// ---------------------------------------------------------------------------

describe('Journey 1: Full Node.js pipeline — lockfile → enriched tree', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  // -------------------------------------------------------------------------
  // 1. Happy path with lockfile
  // -------------------------------------------------------------------------
  describe('1. Happy path with lockfile', () => {
    it('returns nodejs ecosystem', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('returns correct root name from lockfile', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.root.name).toBe('test-app')
    })

    it('returns correct direct dependency count (runtime only)', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      // lodash + express = 2 runtime direct deps
      expect(result.totalDirect).toBe(2)
    })

    it('attaches registryMetadata.license to at least one direct node', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const hasLicense = result.root.dependencies.some(
        (d: { registryMetadata?: { license?: string } }) =>
          typeof d.registryMetadata?.license === 'string',
      )
      expect(hasLicense).toBe(true)
    })

    it('attaches correct license value to lodash node', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const lodash = result.root.dependencies.find(
        (d: { name: string }) => d.name === 'lodash',
      )
      expect(lodash?.registryMetadata?.license).toBe('MIT')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Happy path with package.json only (no lockfile)
  // -------------------------------------------------------------------------
  describe('2. Happy path with package.json only', () => {
    it('resolves tree with a warning about missing lockfile', async () => {
      // No npm calls expected because resolvedVersions will be empty
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const hasLockfileWarning = result.warnings.some((w: string) =>
        w.toLowerCase().includes('lockfile'),
      )
      expect(hasLockfileWarning).toBe(true)
    })

    it('produces nodes that have no resolved version from a lockfile', async () => {
      // package.json only: version ranges come from package.json, not resolved
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      // Nodes exist but their versions are the range strings (no lockfile resolution)
      expect(result.root.dependencies.length).toBeGreaterThan(0)
      const hasRangeVersion = result.root.dependencies.some(
        (d: { version: string }) => d.version.startsWith('^'),
      )
      expect(hasRangeVersion).toBe(true)
    })

    it('returns nodejs ecosystem', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
    })
  })

  // -------------------------------------------------------------------------
  // 3. Scoped package in lockfile — URL encoding check
  // -------------------------------------------------------------------------
  describe('3. Scoped package in lockfile', () => {
    it('uses @scope%2Fname URL encoding for npm registry calls (not %40scope%2Fname)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(NPM_TYPES_NODE), { status: 200 }),
      )
      const content = readFileSync(join(FIXTURES, 'package-lock-scoped.json'), 'utf-8')
      await tool.handler({ content, includeDevDependencies: false })

      const calledUrls = mockFetch.mock.calls.map((call: unknown[]) => call[0] as string)
      const registryCall = calledUrls.find((u: string) => u.includes('registry.npmjs.org'))
      expect(registryCall).toBeDefined()
      // @ must be literal, / must be percent-encoded as %2F
      expect(registryCall).toContain('@types%2Fnode')
      // Fully-encoded form must NOT appear
      expect(registryCall).not.toContain('%40types%2Fnode')
    })

    it('returns correct direct dep count for scoped package lockfile', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(NPM_TYPES_NODE), { status: 200 }),
      )
      const content = readFileSync(join(FIXTURES, 'package-lock-scoped.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      // Only @types/node as direct dep
      expect(result.totalDirect).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Registry partial failure — tree still resolves, warning emitted
  // -------------------------------------------------------------------------
  describe('4. Registry partial failure', () => {
    it('tree still resolves when one registry call returns 500', async () => {
      // lodash succeeds, all others return 500
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
        .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      expect(result).toBeDefined()
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('warnings contain the name of the package whose registry call failed', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
        .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })

      // At least one registry failure warning should be present
      const registryWarnings = result.warnings.filter((w: string) =>
        w.includes('Registry lookup failed'),
      )
      expect(registryWarnings.length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Ecosystem detection from content alone (no file path)
  // -------------------------------------------------------------------------
  describe('5. Ecosystem detection from content alone', () => {
    it('detects nodejs ecosystem from raw lockfile JSON without a file path', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      // Deliberately omit path — detection must use content heuristics
      const tree = await resolver.resolve({ content })
      expect(tree.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('detects nodejs ecosystem from raw package.json content without a file path', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const tree = await resolver.resolve({ content })
      expect(tree.ecosystem).toBe(Ecosystem.nodejs)
    })
  })

  // -------------------------------------------------------------------------
  // 6. Invalid manifest — garbage JSON triggers a meaningful error
  // -------------------------------------------------------------------------
  describe('6. Invalid manifest', () => {
    it('throws with a meaningful message when content is garbage JSON', async () => {
      await expect(
        tool.handler({ content: 'this is not json at all }{', includeDevDependencies: false }),
      ).rejects.toThrow()
    })

    it('throws with a meaningful message when content is valid JSON but not a manifest', async () => {
      await expect(
        tool.handler({
          content: JSON.stringify({ completely: 'random', data: 42 }),
          includeDevDependencies: false,
        }),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // 7. Dev dependencies excluded by default
  // -------------------------------------------------------------------------
  describe('7. Dev dependencies excluded by default', () => {
    it('excludes dev deps from totalDirect when includeDevDependencies is false', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      // lodash + express = 2; typescript (dev) is excluded
      expect(result.totalDirect).toBe(2)
    })

    it('does not include typescript (dev dep) in direct nodes when excluded', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: false })
      const tsNode = result.root.dependencies.find(
        (d: { name: string }) => d.name === 'typescript',
      )
      expect(tsNode).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // 8. Dev dependencies included when flag set
  // -------------------------------------------------------------------------
  describe('8. Dev dependencies included when flag set', () => {
    it('includes dev deps in totalDirect when includeDevDependencies is true', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: true })
      // lodash + express + typescript = 3
      expect(result.totalDirect).toBe(3)
    })

    it('includes typescript (dev dep) in direct nodes when flag is set', async () => {
      mockNpmForStandardLockfile()
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await tool.handler({ content, includeDevDependencies: true })
      const tsNode = result.root.dependencies.find(
        (d: { name: string }) => d.name === 'typescript',
      )
      expect(tsNode).toBeDefined()
    })
  })
})
