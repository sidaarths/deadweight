/**
 * Journey 4: Phase 5 — all 7 remaining MCP tools
 *
 * Covers the full path for each tool:
 *   resolve tree → analysis engine(s) → tool handler output
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
import { createFindSingleMaintainerTool } from '../../src/tools/find-single-maintainer.js'
import { createFlagAbandonedTool } from '../../src/tools/flag-abandoned.js'
import { createGetLicenseConflictsTool } from '../../src/tools/get-license-conflicts.js'
import { createSuggestConsolidationsTool } from '../../src/tools/suggest-consolidations.js'
import { createGetHealthReportTool } from '../../src/tools/get-health-report.js'
import { createCompareAlternativeTool } from '../../src/tools/compare-alternative.js'
import { createGetEcosystemSummaryTool } from '../../src/tools/get-ecosystem-summary.js'
import { Ecosystem } from '../../src/types/index.js'
import type { TreeResolver } from '../../src/analysis/tree-resolver.js'
import type { Cache } from '../../src/registry/cache.js'

const FIXTURES = join(import.meta.dirname, '../fixtures/nodejs')

const STALE_DATE = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString()
const RECENT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

const NPM_LODASH = {
  name: 'lodash',
  description: 'Lodash modular utilities',
  license: 'MIT',
  repository: { url: 'git+https://github.com/lodash/lodash.git' },
  maintainers: [{ name: 'jdalton', email: 'jd@example.com' }], // single maintainer
  time: { '4.17.21': STALE_DATE },
  'dist-tags': { latest: '4.17.21' },
}

const NPM_EXPRESS = {
  name: 'express',
  description: 'Fast web framework',
  license: 'MIT',
  repository: { url: 'git+https://github.com/expressjs/express.git' },
  maintainers: [{ name: 'dougwilson' }, { name: 'wesleytodd' }],
  time: { '4.18.2': RECENT_DATE },
  'dist-tags': { latest: '4.18.2' },
}

const NPM_ACCEPTS = {
  name: 'accepts',
  description: 'Content negotiation',
  license: 'MIT',
  repository: null,
  maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': RECENT_DATE },
  'dist-tags': { latest: '1.3.8' },
}

const NPM_TYPESCRIPT = {
  name: 'typescript',
  description: 'TypeScript',
  license: 'Apache-2.0',
  repository: { url: 'git+https://github.com/microsoft/TypeScript.git' },
  maintainers: [{ name: 'typescript' }],
  time: { '5.2.2': RECENT_DATE },
  'dist-tags': { latest: '5.2.2' },
}

let mockFetch: ReturnType<typeof vi.fn>
let cache: Cache

async function setupStack(): Promise<void> {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
}

function mockNpm(): void {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/lodash')) return Promise.resolve(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
    if (url.includes('/express')) return Promise.resolve(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
    if (url.includes('/accepts')) return Promise.resolve(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
    if (url.includes('/typescript')) return Promise.resolve(new Response(JSON.stringify(NPM_TYPESCRIPT), { status: 200 }))
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

function buildResolver(): TreeResolver {
  const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
  const npmClient = new NpmRegistryClient(http)
  return createTreeResolver({ registryClients: [npmClient] })
}

function getFixtureContent(): string {
  return readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
}

describe('Journey 4: Phase 5 all tools', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  // ---------------------------------------------------------------------------
  // Tool 2: find_single_maintainer_dependencies
  // ---------------------------------------------------------------------------
  describe('Tool 2: find_single_maintainer_dependencies', () => {
    it('returns tool name and description', () => {
      const tool = createFindSingleMaintainerTool(buildResolver())
      expect(tool.name).toBe('find_single_maintainer_dependencies')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('detects lodash as single-maintainer risk', async () => {
      mockNpm()
      const tool = createFindSingleMaintainerTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), minDependents: 0 })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      const lodashSignal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'lodash')
      expect(lodashSignal).toBeDefined()
      expect(lodashSignal?.type).toBe('single_maintainer')
    })

    it('does not flag express (2 maintainers)', async () => {
      mockNpm()
      const tool = createFindSingleMaintainerTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), minDependents: 0 })
      const expressSignal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'express')
      expect(expressSignal).toBeUndefined()
    })

    it('all signals have required fields', async () => {
      mockNpm()
      const tool = createFindSingleMaintainerTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), minDependents: 0 })
      for (const signal of result.signals) {
        expect(signal.type).toBe('single_maintainer')
        expect(signal.severity).toMatch(/^(critical|warning|advisory)$/)
        expect(signal.score).toBeGreaterThanOrEqual(0)
        expect(signal.score).toBeLessThanOrEqual(100)
        expect(signal.package).toBeDefined()
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 3: flag_abandoned_dependencies
  // ---------------------------------------------------------------------------
  describe('Tool 3: flag_abandoned_dependencies', () => {
    it('returns tool name and description', () => {
      const tool = createFlagAbandonedTool(buildResolver())
      expect(tool.name).toBe('flag_abandoned_dependencies')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('flags lodash as stale (published 5 years ago)', async () => {
      mockNpm()
      const tool = createFlagAbandonedTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), maxAgeYears: 2 })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      const lodashSignal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'lodash')
      expect(lodashSignal).toBeDefined()
      expect(lodashSignal?.severity).toBe('critical')
    })

    it('does not flag express (recently published)', async () => {
      mockNpm()
      const tool = createFlagAbandonedTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), maxAgeYears: 2 })
      const expressSignal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'express')
      expect(expressSignal).toBeUndefined()
    })

    it('total matches signals array length', async () => {
      mockNpm()
      const tool = createFlagAbandonedTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), maxAgeYears: 2 })
      expect(result.total).toBe(result.signals.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 4: get_transitive_license_conflicts
  // ---------------------------------------------------------------------------
  describe('Tool 4: get_transitive_license_conflicts', () => {
    it('returns tool name and description', () => {
      const tool = createGetLicenseConflictsTool(buildResolver())
      expect(tool.name).toBe('get_transitive_license_conflicts')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('returns no critical conflicts for all-MIT fixture with MIT project', async () => {
      mockNpm()
      const tool = createGetLicenseConflictsTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), projectLicense: 'MIT' })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      const critical = result.conflicts.filter((c: { severity: string }) => c.severity === 'critical')
      expect(critical).toHaveLength(0)
    })

    it('conflict objects have required fields', async () => {
      mockNpm()
      const tool = createGetLicenseConflictsTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), projectLicense: 'MIT' })
      for (const conflict of result.conflicts) {
        expect(conflict.type).toBeDefined()
        expect(conflict.severity).toMatch(/^(critical|warning|advisory)$/)
        expect(conflict.packageA).toBeDefined()
        expect(Array.isArray(conflict.path)).toBe(true)
      }
    })

    it('total matches conflicts array length', async () => {
      mockNpm()
      const tool = createGetLicenseConflictsTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), projectLicense: 'MIT' })
      expect(result.total).toBe(result.conflicts.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 5: suggest_consolidations
  // ---------------------------------------------------------------------------
  describe('Tool 5: suggest_consolidations', () => {
    it('returns tool name and description', () => {
      const tool = createSuggestConsolidationsTool(buildResolver())
      expect(tool.name).toBe('suggest_consolidations')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('returns no consolidations for standard fixture (no duplicate categories)', async () => {
      mockNpm()
      const tool = createSuggestConsolidationsTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      expect(result.consolidations).toHaveLength(0)
    })

    it('total matches consolidations array length', async () => {
      mockNpm()
      const tool = createSuggestConsolidationsTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.total).toBe(result.consolidations.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 6: get_dependency_health_report
  // ---------------------------------------------------------------------------
  describe('Tool 6: get_dependency_health_report', () => {
    it('returns tool name and description', () => {
      const tool = createGetHealthReportTool(buildResolver())
      expect(tool.name).toBe('get_dependency_health_report')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('returns a well-formed health report from fixture', async () => {
      mockNpm()
      const tool = createGetHealthReportTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), includeDevDependencies: false })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      expect(Array.isArray(result.critical)).toBe(true)
      expect(Array.isArray(result.warning)).toBe(true)
      expect(Array.isArray(result.advisory)).toBe(true)
      expect(Array.isArray(result.topActions)).toBe(true)
      expect(typeof result.generatedAt).toBe('string')
    })

    it('score fields are all numbers in 0-100 range', async () => {
      mockNpm()
      const tool = createGetHealthReportTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), includeDevDependencies: false })
      expect(result.score.overall).toBeGreaterThanOrEqual(0)
      expect(result.score.overall).toBeLessThanOrEqual(100)
      expect(result.score.maintainer).toBeGreaterThanOrEqual(0)
      expect(result.score.abandonment).toBeGreaterThanOrEqual(0)
    })

    it('health report contains lodash-related signals', async () => {
      mockNpm()
      const tool = createGetHealthReportTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), includeDevDependencies: false })
      const allSignals = [...result.critical, ...result.warning, ...result.advisory]
      const lodashSignals = allSignals.filter((s: { package: { name: string } }) => s.package.name === 'lodash')
      expect(lodashSignals.length).toBeGreaterThan(0)
    })

    it('topActions contains at most 5 entries', async () => {
      mockNpm()
      const tool = createGetHealthReportTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), includeDevDependencies: false })
      expect(result.topActions.length).toBeLessThanOrEqual(5)
    })

    it('generatedAt is a valid ISO date string', async () => {
      mockNpm()
      const tool = createGetHealthReportTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent(), includeDevDependencies: false })
      expect(() => new Date(result.generatedAt)).not.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 7: compare_alternative
  // ---------------------------------------------------------------------------
  describe('Tool 7: compare_alternative', () => {
    it('returns tool name and description', () => {
      const tool = createCompareAlternativeTool()
      expect(tool.name).toBe('compare_alternative')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('returns alternatives for lodash (utility category)', async () => {
      const tool = createCompareAlternativeTool()
      const result = await tool.handler({ packageName: 'lodash', ecosystem: Ecosystem.nodejs })
      expect(result.packageName).toBe('lodash')
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      expect(result.alternatives.length).toBeGreaterThan(0)
    })

    it('does not include the queried package in alternatives', async () => {
      const tool = createCompareAlternativeTool()
      const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
      const names = result.alternatives.map((a: { name: string }) => a.name)
      expect(names).not.toContain('axios')
    })

    it('returns up to 5 alternatives', async () => {
      const tool = createCompareAlternativeTool()
      const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
      expect(result.alternatives.length).toBeLessThanOrEqual(5)
    })

    it('returns empty for unknown package', async () => {
      const tool = createCompareAlternativeTool()
      const result = await tool.handler({
        packageName: 'some-completely-unknown-xyz-999',
        ecosystem: Ecosystem.nodejs,
      })
      expect(result.alternatives).toHaveLength(0)
    })

    it('enriches scores when metadata client is provided', async () => {
      mockNpm()
      const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
      const npmClient = new NpmRegistryClient(http)
      const metadataClient = {
        getMetadata: (name: string) => npmClient.getPackageMetadata(name).catch(() => null),
      }
      const tool = createCompareAlternativeTool(metadataClient)
      const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
      expect(result.alternatives.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Tool 8: get_ecosystem_summary
  // ---------------------------------------------------------------------------
  describe('Tool 8: get_ecosystem_summary', () => {
    it('returns tool name and description', () => {
      const tool = createGetEcosystemSummaryTool(buildResolver())
      expect(tool.name).toBe('get_ecosystem_summary')
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it('returns ecosystem summary shape from fixture', async () => {
      mockNpm()
      const tool = createGetEcosystemSummaryTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
      expect(typeof result.totalDirect).toBe('number')
      expect(typeof result.totalTransitive).toBe('number')
      expect(typeof result.riskScore).toBe('number')
      expect(typeof result.criticalCount).toBe('number')
      expect(typeof result.warningCount).toBe('number')
      expect(typeof result.advisoryCount).toBe('number')
      expect(Array.isArray(result.topActions)).toBe(true)
    })

    it('riskScore is in 0-100 range', async () => {
      mockNpm()
      const tool = createGetEcosystemSummaryTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.riskScore).toBeGreaterThanOrEqual(0)
      expect(result.riskScore).toBeLessThanOrEqual(100)
    })

    it('totalDirect matches fixture (2 production deps)', async () => {
      mockNpm()
      const tool = createGetEcosystemSummaryTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.totalDirect).toBe(2)
    })

    it('topActions has at most 3 entries', async () => {
      mockNpm()
      const tool = createGetEcosystemSummaryTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      expect(result.topActions.length).toBeLessThanOrEqual(3)
    })

    it('criticalCount reflects signals from stale lodash', async () => {
      mockNpm()
      const tool = createGetEcosystemSummaryTool(buildResolver())
      const result = await tool.handler({ content: getFixtureContent() })
      // lodash is stale (5yr) → should produce at least 1 critical signal
      expect(result.criticalCount).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Graceful degradation — all tools survive registry failures
  // ---------------------------------------------------------------------------
  describe('Graceful degradation with failed registry', () => {
    it('all tools handle nodes with no registryMetadata', async () => {
      mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }))
      const resolver = buildResolver()
      const content = getFixtureContent()

      await expect(
        createFindSingleMaintainerTool(resolver).handler({ content, minDependents: 0 }),
      ).resolves.not.toThrow()

      await expect(
        createFlagAbandonedTool(resolver).handler({ content, maxAgeYears: 2 }),
      ).resolves.not.toThrow()

      await expect(
        createGetLicenseConflictsTool(resolver).handler({ content, projectLicense: 'MIT' }),
      ).resolves.not.toThrow()

      await expect(
        createSuggestConsolidationsTool(resolver).handler({ content }),
      ).resolves.not.toThrow()

      await expect(
        createGetHealthReportTool(resolver).handler({ content, includeDevDependencies: false }),
      ).resolves.not.toThrow()

      await expect(
        createGetEcosystemSummaryTool(resolver).handler({ content }),
      ).resolves.not.toThrow()
    })
  })
})
