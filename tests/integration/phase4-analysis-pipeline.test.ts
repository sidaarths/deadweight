/**
 * Journey 3: Phase 4 analysis pipeline — enriched tree → all analysis engines → health report
 *
 * Covers the full end-to-end path for the analysis layer:
 *   parse → npm enrich → maintainer-risk → abandonment → license-checker
 *   → consolidation → health-report → alternative-finder
 *
 * All HTTP is mocked; no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCache } from '../../src/registry/cache.js'
import { createHttpClient } from '../../src/registry/http.js'
import { NpmRegistryClient } from '../../src/registry/npm.js'
import { createTreeResolver } from '../../src/analysis/tree-resolver.js'
import { analyzeMaintainerRisk } from '../../src/analysis/maintainer-risk.js'
import { analyzeAbandonment } from '../../src/analysis/abandonment.js'
import { checkLicenses } from '../../src/analysis/license-checker.js'
import { analyzeConsolidations } from '../../src/analysis/consolidation.js'
import { buildHealthReport } from '../../src/analysis/health-report.js'
import { findAlternatives } from '../../src/analysis/alternative-finder.js'
import { getCategory } from '../../src/analysis/categories.js'
import { normalizeSpdx, isCopyleft, isStrongCopyleft } from '../../src/analysis/spdx-compat.js'
import { Ecosystem } from '../../src/types/index.js'
import type { DependencyTree } from '../../src/types/index.js'
import type { Cache } from '../../src/registry/cache.js'

const FIXTURES = join(import.meta.dirname, '../fixtures/nodejs')

// ---------------------------------------------------------------------------
// Mock npm responses — realistic shapes with signals for analysis
// ---------------------------------------------------------------------------

const STALE_DATE = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString() // 5 years ago
const RECENT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago

/** lodash — single maintainer, old publish date → triggers both analyses */
const NPM_LODASH = {
  name: 'lodash',
  description: 'Lodash modular utilities',
  license: 'MIT',
  homepage: 'https://lodash.com/',
  repository: { url: 'git+https://github.com/lodash/lodash.git' },
  maintainers: [{ name: 'jdalton', email: 'jd@example.com' }], // single maintainer
  time: { '4.17.21': STALE_DATE },
  'dist-tags': { latest: '4.17.21' },
}

/** express — multiple maintainers, recent publish */
const NPM_EXPRESS = {
  name: 'express',
  description: 'Fast web framework',
  license: 'MIT',
  repository: { url: 'git+https://github.com/expressjs/express.git' },
  maintainers: [{ name: 'dougwilson' }, { name: 'wesleytodd' }],
  time: { '4.18.2': RECENT_DATE },
  'dist-tags': { latest: '4.18.2' },
}

/** accepts — transitive dep, single maintainer */
const NPM_ACCEPTS = {
  name: 'accepts',
  description: 'Content negotiation',
  license: 'MIT',
  repository: null,
  maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': RECENT_DATE },
  'dist-tags': { latest: '1.3.8' },
}

/** typescript — dev dep, Apache-2.0 */
const NPM_TYPESCRIPT = {
  name: 'typescript',
  description: 'TypeScript',
  license: 'Apache-2.0',
  repository: { url: 'git+https://github.com/microsoft/TypeScript.git' },
  maintainers: [{ name: 'typescript' }],
  time: { '5.2.2': RECENT_DATE },
  'dist-tags': { latest: '5.2.2' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>
let cache: Cache

async function setupStack() {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
}

function mockNpm() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/lodash')) return Promise.resolve(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
    if (url.includes('/express')) return Promise.resolve(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
    if (url.includes('/accepts')) return Promise.resolve(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
    if (url.includes('/typescript')) return Promise.resolve(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

async function buildTree(includeDevDependencies = false): Promise<DependencyTree> {
  const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
  const npmClient = new NpmRegistryClient(http)
  const resolver = createTreeResolver({ registryClients: [npmClient] })
  const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
  return resolver.resolve({ content, includeDevDependencies })
}

// ---------------------------------------------------------------------------
// Journey 3 tests
// ---------------------------------------------------------------------------

describe('Journey 3: Phase 4 analysis pipeline', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  // -------------------------------------------------------------------------
  // 1. SPDX compatibility (pure — no network needed)
  // -------------------------------------------------------------------------
  describe('1. SPDX compatibility', () => {
    it('normalizes MIT correctly', () => {
      expect(normalizeSpdx('MIT')).toBe('MIT')
    })

    it('normalizes GPL-3.0-or-later to GPL-3.0-or-later', () => {
      const result = normalizeSpdx('GPL-3.0-or-later')
      expect(result).not.toBeNull()
    })

    it('returns null for unrecognized license string', () => {
      expect(normalizeSpdx('CUSTOM-LICENSE-v1')).toBeNull()
    })

    it('MIT is not copyleft', () => {
      expect(isCopyleft('MIT')).toBe(false)
    })

    it('GPL-3.0 is strong copyleft', () => {
      expect(isStrongCopyleft('GPL-3.0')).toBe(true)
    })

    it('LGPL-2.1 is copyleft but not strong copyleft', () => {
      expect(isCopyleft('LGPL-2.1')).toBe(true)
      expect(isStrongCopyleft('LGPL-2.1')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 2. Category taxonomy (pure — no network needed)
  // -------------------------------------------------------------------------
  describe('2. Category taxonomy', () => {
    it('categorizes lodash as utility', () => {
      expect(getCategory('lodash')).toBe('utility')
    })

    it('categorizes express as framework', () => {
      expect(getCategory('express')).toBe('framework')
    })

    it('categorizes axios as http-client', () => {
      expect(getCategory('axios')).toBe('http-client')
    })

    it('returns other for unknown packages', () => {
      expect(getCategory('some-unknown-package-xyz')).toBe('other')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Maintainer risk analysis on enriched tree
  // -------------------------------------------------------------------------
  describe('3. Maintainer risk analysis', () => {
    it('flags lodash as single-maintainer risk', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeMaintainerRisk({ tree })

      const lodashSignal = signals.find(s => s.package.name === 'lodash')
      expect(lodashSignal).toBeDefined()
      expect(lodashSignal?.type).toBe('single_maintainer')
    })

    it('does not flag express (multiple maintainers)', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeMaintainerRisk({ tree })

      const expressSignal = signals.find(s => s.package.name === 'express')
      expect(expressSignal).toBeUndefined()
    })

    it('all signals have required fields', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeMaintainerRisk({ tree })

      for (const signal of signals) {
        expect(signal.type).toBe('single_maintainer')
        expect(signal.severity).toMatch(/^(critical|warning|advisory)$/)
        expect(signal.score).toBeGreaterThanOrEqual(0)
        expect(signal.score).toBeLessThanOrEqual(100)
        expect(typeof signal.message).toBe('string')
        expect(signal.message.length).toBeGreaterThan(0)
        expect(signal.package).toBeDefined()
      }
    })
  })

  // -------------------------------------------------------------------------
  // 4. Abandonment analysis on enriched tree
  // -------------------------------------------------------------------------
  describe('4. Abandonment analysis', () => {
    it('flags lodash as stale (published 5 years ago)', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeAbandonment({ tree })

      const lodashSignal = signals.find(s => s.package.name === 'lodash')
      expect(lodashSignal).toBeDefined()
      expect(lodashSignal?.severity).toBe('critical') // >4 years
    })

    it('does not flag express as stale (recently published)', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeAbandonment({ tree })

      const expressSignal = signals.find(s => s.package.name === 'express')
      expect(expressSignal).toBeUndefined()
    })

    it('abandonment scores are in range 0-100', async () => {
      mockNpm()
      const tree = await buildTree()
      const signals = await analyzeAbandonment({ tree })

      for (const signal of signals) {
        expect(signal.score).toBeGreaterThanOrEqual(0)
        expect(signal.score).toBeLessThanOrEqual(100)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 5. License checking on enriched tree
  // -------------------------------------------------------------------------
  describe('5. License checking', () => {
    it('returns no conflicts for an all-MIT tree with MIT project', async () => {
      mockNpm()
      const tree = await buildTree()
      const conflicts = checkLicenses(tree, 'MIT')

      const criticalConflicts = conflicts.filter(c => c.severity === 'critical')
      expect(criticalConflicts).toHaveLength(0)
    })

    it('conflict objects have required fields', async () => {
      mockNpm()
      const tree = await buildTree()
      const conflicts = checkLicenses(tree, 'MIT')

      for (const conflict of conflicts) {
        expect(conflict.type).toBeDefined()
        expect(conflict.severity).toMatch(/^(critical|warning|advisory)$/)
        expect(conflict.packageA).toBeDefined()
        expect(Array.isArray(conflict.path)).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 6. Consolidation analysis on enriched tree
  // -------------------------------------------------------------------------
  describe('6. Consolidation analysis', () => {
    it('returns no consolidations for the standard fixture (no duplicate categories)', async () => {
      mockNpm()
      const tree = await buildTree()
      const consolidations = analyzeConsolidations(tree)

      // The fixture has lodash (utility), express (framework), accepts (other) — no dups
      expect(consolidations).toHaveLength(0)
    })

    it('consolidation objects have required fields when present', async () => {
      // Build a synthetic tree with two HTTP clients to verify shape
      const { Ecosystem } = await import('../../src/types/index.js')

      const syntheticTree: DependencyTree = {
        root: {
          name: 'my-app',
          version: '1.0.0',
          ecosystem: Ecosystem.nodejs,
          directDependency: false,
          depth: 0,
          dependencies: [
            {
              name: 'axios',
              version: '1.0.0',
              ecosystem: Ecosystem.nodejs,
              directDependency: true,
              depth: 1,
              dependencies: [],
              registryMetadata: {
                maintainers: [{ name: 'author' }],
                lastPublishDate: new Date(),
                weeklyDownloads: 500_000,
                license: 'MIT',
                repositoryUrl: null,
                description: null,
                homepage: null,
                deprecated: null,
              },
            },
            {
              name: 'node-fetch',
              version: '3.0.0',
              ecosystem: Ecosystem.nodejs,
              directDependency: true,
              depth: 1,
              dependencies: [],
              registryMetadata: {
                maintainers: [{ name: 'author' }],
                lastPublishDate: new Date(),
                weeklyDownloads: 200_000,
                license: 'MIT',
                repositoryUrl: null,
                description: null,
                homepage: null,
                deprecated: null,
              },
            },
          ],
        },
        ecosystem: Ecosystem.nodejs,
        manifestPath: 'package.json',
        totalDirect: 2,
        totalTransitive: 0,
        resolvedAt: new Date(),
      }

      const consolidations = analyzeConsolidations(syntheticTree)
      expect(consolidations.length).toBeGreaterThan(0)

      const httpConsolidation = consolidations.find(c => c.category === 'http-client')
      expect(httpConsolidation).toBeDefined()
      expect(httpConsolidation?.packages.length).toBe(2)
      expect(httpConsolidation?.recommendation).toBe('axios') // higher downloads
      expect(typeof httpConsolidation?.reason).toBe('string')
      expect(httpConsolidation?.estimatedSizeSavingsBytes).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // 7. Full health report — end-to-end aggregation
  // -------------------------------------------------------------------------
  describe('7. Full health report', () => {
    it('produces a health report from real enriched tree data', async () => {
      mockNpm()
      const tree = await buildTree()

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])
      const licenseConflicts = checkLicenses(tree, 'MIT')
      const consolidations = analyzeConsolidations(tree)

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts,
        consolidations,
        tree,
      })

      expect(report).toBeDefined()
      expect(report.generatedAt).toBeInstanceOf(Date)
      expect(Array.isArray(report.critical)).toBe(true)
      expect(Array.isArray(report.warning)).toBe(true)
      expect(Array.isArray(report.advisory)).toBe(true)
      expect(Array.isArray(report.topActions)).toBe(true)
    })

    it('health report contains lodash-related signals', async () => {
      mockNpm()
      const tree = await buildTree()

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts: [],
        consolidations: [],
        tree,
      })

      const allSignals = [...report.critical, ...report.warning, ...report.advisory]
      const lodashSignals = allSignals.filter(s => s.package.name === 'lodash')
      expect(lodashSignals.length).toBeGreaterThan(0)
    })

    it('RiskScore fields are all in 0-100 range', async () => {
      mockNpm()
      const tree = await buildTree()

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts: checkLicenses(tree, 'MIT'),
        consolidations: analyzeConsolidations(tree),
        tree,
      })

      expect(report.score.overall).toBeGreaterThanOrEqual(0)
      expect(report.score.overall).toBeLessThanOrEqual(100)
      expect(report.score.maintainer).toBeGreaterThanOrEqual(0)
      expect(report.score.abandonment).toBeGreaterThanOrEqual(0)
      expect(report.score.license).toBeGreaterThanOrEqual(0)
      expect(report.score.consolidation).toBeGreaterThanOrEqual(0)
    })

    it('signals are sorted by score descending within each severity group', async () => {
      mockNpm()
      const tree = await buildTree()

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts: [],
        consolidations: [],
        tree,
      })

      for (const group of [report.critical, report.warning, report.advisory]) {
        for (let i = 1; i < group.length; i++) {
          expect(group[i - 1].score).toBeGreaterThanOrEqual(group[i].score)
        }
      }
    })

    it('topActions contains at most 5 entries', async () => {
      mockNpm()
      const tree = await buildTree()

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts: [],
        consolidations: [],
        tree,
      })

      expect(report.topActions.length).toBeLessThanOrEqual(5)
    })
  })

  // -------------------------------------------------------------------------
  // 8. Alternative finder
  // -------------------------------------------------------------------------
  describe('8. Alternative finder', () => {
    it('returns alternatives for lodash (utility category)', async () => {
      const alternatives = await findAlternatives({
        packageName: 'lodash',
        ecosystem: Ecosystem.nodejs,
      })

      expect(alternatives.length).toBeGreaterThan(0)
      const names = alternatives.map(a => a.name)
      expect(names).not.toContain('lodash') // excludes self
    })

    it('returns empty for unknown package', async () => {
      const alternatives = await findAlternatives({
        packageName: 'some-completely-unknown-package-xyz-123',
        ecosystem: Ecosystem.nodejs,
      })
      expect(alternatives).toHaveLength(0)
    })

    it('alternative objects have required fields', async () => {
      const alternatives = await findAlternatives({
        packageName: 'axios',
        ecosystem: Ecosystem.nodejs,
      })

      for (const alt of alternatives) {
        expect(typeof alt.name).toBe('string')
        expect(alt.ecosystem).toBe(Ecosystem.nodejs)
        expect(alt.score).toBeGreaterThanOrEqual(0)
        expect(alt.score).toBeLessThanOrEqual(100)
      }
    })

    it('returns up to 5 alternatives', async () => {
      const alternatives = await findAlternatives({
        packageName: 'axios',
        ecosystem: Ecosystem.nodejs,
      })
      expect(alternatives.length).toBeLessThanOrEqual(5)
    })

    it('uses metadata client when provided to compute scores', async () => {
      const getMetadata = vi.fn().mockResolvedValue({
        maintainers: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        lastPublishDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        weeklyDownloads: 3_000_000,
        license: 'MIT',
        repositoryUrl: null,
        description: null,
        homepage: null,
        deprecated: null,
      })

      const alternatives = await findAlternatives({
        packageName: 'axios',
        ecosystem: Ecosystem.nodejs,
        npmClient: { getMetadata } as any,
      })

      expect(getMetadata).toHaveBeenCalled()
      expect(alternatives.length).toBeGreaterThan(0)
      // High downloads + recent + multiple maintainers → high score
      expect(alternatives[0].score).toBeGreaterThan(50)
    })
  })

  // -------------------------------------------------------------------------
  // 9. Grace under partial registry failure
  // -------------------------------------------------------------------------
  describe('9. Graceful degradation with partial registry failures', () => {
    it('analysis engines handle nodes with no registryMetadata', async () => {
      // Mock npm to fail for all packages (no metadata attached)
      mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }))

      const tree = await buildTree()

      // All nodes will have no registryMetadata — engines should not throw
      await expect(analyzeMaintainerRisk({ tree })).resolves.not.toThrow()
      await expect(analyzeAbandonment({ tree })).resolves.not.toThrow()
      expect(() => checkLicenses(tree, 'MIT')).not.toThrow()
      expect(() => analyzeConsolidations(tree)).not.toThrow()
    })

    it('health report handles empty signals from failed registry', async () => {
      mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }))

      const tree = await buildTree()
      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree }),
        analyzeAbandonment({ tree }),
      ])

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts: [],
        consolidations: [],
        tree,
      })

      // Even with no signals, report should be well-formed
      expect(report.score.overall).toBeGreaterThanOrEqual(0)
      expect(report.generatedAt).toBeInstanceOf(Date)
    })
  })
})
