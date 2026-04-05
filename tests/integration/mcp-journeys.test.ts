/**
 * MCP Journey Tests
 *
 * Covers three critical multi-tool user flows that mirror how an LLM would
 * call MCP tools in sequence against a running server.  All HTTP is mocked;
 * no real network calls are made.
 *
 * Journey 1: "Diagnose a Node.js project"
 *   analyze_dependency_tree → get_dependency_health_report → compare_alternative
 *
 * Journey 2: "License audit"
 *   analyze_dependency_tree → get_transitive_license_conflicts
 *   (MIT project with a transitive GPL-3.0 dependency)
 *
 * Journey 3: "Quick dashboard"
 *   analyze_dependency_tree → get_ecosystem_summary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCache } from '../../src/registry/cache.js'
import { createHttpClient } from '../../src/registry/http.js'
import { NpmRegistryClient } from '../../src/registry/npm.js'
import { createTreeResolver } from '../../src/analysis/tree-resolver.js'
import { createAnalyzeDependencyTreeTool } from '../../src/tools/analyze-dependency-tree.js'
import { createGetHealthReportTool } from '../../src/tools/get-health-report.js'
import { createCompareAlternativeTool } from '../../src/tools/compare-alternative.js'
import { createGetLicenseConflictsTool } from '../../src/tools/get-license-conflicts.js'
import { createGetEcosystemSummaryTool } from '../../src/tools/get-ecosystem-summary.js'
import { Ecosystem } from '../../src/types/index.js'
import type { Cache } from '../../src/registry/cache.js'
import type { TreeResolver } from '../../src/analysis/tree-resolver.js'

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const STALE_DATE = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString()
const RECENT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

// ---------------------------------------------------------------------------
// NPM registry mock payloads
// ---------------------------------------------------------------------------
const NPM_LODASH = {
  name: 'lodash',
  description: 'Lodash modular utilities',
  license: 'MIT',
  repository: { url: 'git+https://github.com/lodash/lodash.git' },
  maintainers: [{ name: 'jdalton', email: 'jd@example.com' }],
  time: { '4.17.21': STALE_DATE },
  'dist-tags': { latest: '4.17.21' },
}

const NPM_EXPRESS = {
  name: 'express',
  description: 'Fast, unopinionated web framework',
  license: 'MIT',
  repository: { url: 'git+https://github.com/expressjs/express.git' },
  maintainers: [{ name: 'dougwilson' }, { name: 'wesleytodd' }],
  time: { '4.18.2': RECENT_DATE },
  'dist-tags': { latest: '4.18.2' },
}

const NPM_ACCEPTS = {
  name: 'accepts',
  description: 'Content-type negotiation',
  license: 'MIT',
  repository: null,
  maintainers: [{ name: 'dougwilson' }],
  time: { '1.3.8': RECENT_DATE },
  'dist-tags': { latest: '1.3.8' },
}

// GPL-licensed dependency used in Journey 2
const NPM_READLINE_GPL = {
  name: 'readline-sync',
  description: 'Synchronous readline for interactively running',
  license: 'GPL-3.0',
  repository: { url: 'git+https://github.com/anseki/readline-sync.git' },
  maintainers: [{ name: 'anseki' }],
  time: { '1.4.10': RECENT_DATE },
  'dist-tags': { latest: '1.4.10' },
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

// Standard fixture: lodash (stale, single-maintainer) and express (recent, 2 maintainers)
const STANDARD_LOCKFILE = JSON.stringify({
  name: 'test-app',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'test-app',
      version: '1.0.0',
      dependencies: {
        lodash: '^4.17.21',
        express: '^4.18.2',
      },
    },
    'node_modules/lodash': {
      version: '4.17.21',
      resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
      integrity: 'sha512-abc',
    },
    'node_modules/express': {
      version: '4.18.2',
      resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
      integrity: 'sha512-def',
      dependencies: {
        accepts: '~1.3.8',
      },
    },
    'node_modules/accepts': {
      version: '1.3.8',
      resolved: 'https://registry.npmjs.org/accepts/-/accepts-1.3.8.tgz',
      integrity: 'sha512-ghi',
    },
  },
})

// GPL fixture: MIT project with a direct GPL-3.0 dependency
const GPL_LOCKFILE = JSON.stringify({
  name: 'mit-project',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'mit-project',
      version: '1.0.0',
      license: 'MIT',
      dependencies: {
        'readline-sync': '^1.4.10',
      },
    },
    'node_modules/readline-sync': {
      version: '1.4.10',
      resolved: 'https://registry.npmjs.org/readline-sync/-/readline-sync-1.4.10.tgz',
      integrity: 'sha512-xyz',
    },
  },
})

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------
let mockFetch: ReturnType<typeof vi.fn>
let cache: Cache

async function setupStack(): Promise<void> {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  cache = await createCache({ dir: ':memory:', ttlSeconds: 60 })
}

function mockNpmStandard(): void {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/lodash')) return Promise.resolve(new Response(JSON.stringify(NPM_LODASH), { status: 200 }))
    if (url.includes('/express')) return Promise.resolve(new Response(JSON.stringify(NPM_EXPRESS), { status: 200 }))
    if (url.includes('/accepts')) return Promise.resolve(new Response(JSON.stringify(NPM_ACCEPTS), { status: 200 }))
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

function mockNpmGpl(): void {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/readline-sync')) return Promise.resolve(new Response(JSON.stringify(NPM_READLINE_GPL), { status: 200 }))
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

function buildResolver(): TreeResolver {
  const http = createHttpClient({ cache, rateLimitPerSecond: 100, retryBaseDelayMs: 1 })
  const npmClient = new NpmRegistryClient(http)
  return createTreeResolver({ registryClients: [npmClient] })
}

// ---------------------------------------------------------------------------
// Journey 1: "Diagnose a Node.js project"
//   analyze_dependency_tree → get_dependency_health_report → compare_alternative
// ---------------------------------------------------------------------------
describe('Journey 1: Diagnose a Node.js project', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  it('step 1 — analyze_dependency_tree resolves the manifest into a dependency graph', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const treeTool = createAnalyzeDependencyTreeTool(resolver)

    const tree = await treeTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    expect(tree.ecosystem).toBe(Ecosystem.nodejs)
    expect(tree.totalDirect).toBe(2)
    expect(tree.totalTransitive).toBeGreaterThanOrEqual(1)
    expect(tree.root.name).toBe('test-app')
    expect(Array.isArray(tree.root.dependencies)).toBe(true)
    expect(tree.root.dependencies).toHaveLength(2)
  })

  it('step 2 — get_dependency_health_report synthesizes risk signals from the resolved tree', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const healthTool = createGetHealthReportTool(resolver)

    const report = await healthTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    expect(report.ecosystem).toBe(Ecosystem.nodejs)
    expect(Array.isArray(report.critical)).toBe(true)
    expect(Array.isArray(report.warning)).toBe(true)
    expect(Array.isArray(report.advisory)).toBe(true)
    expect(report.score.overall).toBeGreaterThanOrEqual(0)
    expect(report.score.overall).toBeLessThanOrEqual(100)
    expect(typeof report.generatedAt).toBe('string')
    expect(() => new Date(report.generatedAt)).not.toThrow()
  })

  it('step 2 — health report surfaces signals for stale, single-maintainer lodash', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const healthTool = createGetHealthReportTool(resolver)

    const report = await healthTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    const allSignals = [...report.critical, ...report.warning, ...report.advisory]
    const lodashSignals = allSignals.filter((s: { package: { name: string } }) => s.package.name === 'lodash')
    expect(lodashSignals.length).toBeGreaterThan(0)
  })

  it('step 2 — health report score is lower than 100 due to lodash risks', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const healthTool = createGetHealthReportTool(resolver)

    const report = await healthTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    // lodash is stale (5 years) and single-maintainer — expect a degraded score
    expect(report.score.overall).toBeLessThan(100)
  })

  it('step 3 — compare_alternative returns ranked alternatives for flagged package lodash', async () => {
    const compareTool = createCompareAlternativeTool()

    const result = await compareTool.handler({ packageName: 'lodash', ecosystem: Ecosystem.nodejs })

    expect(result.packageName).toBe('lodash')
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
    expect(result.alternatives.length).toBeGreaterThan(0)
    expect(result.alternatives.length).toBeLessThanOrEqual(5)
  })

  it('step 3 — alternatives do not include the queried package itself', async () => {
    const compareTool = createCompareAlternativeTool()

    const result = await compareTool.handler({ packageName: 'lodash', ecosystem: Ecosystem.nodejs })

    const names = result.alternatives.map((a: { name: string }) => a.name)
    expect(names).not.toContain('lodash')
  })

  it('full journey — outputs are consistent across all three steps', async () => {
    mockNpmStandard()
    const resolver = buildResolver()

    // Step 1: resolve
    const treeTool = createAnalyzeDependencyTreeTool(resolver)
    const tree = await treeTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })
    expect(tree.ecosystem).toBe(Ecosystem.nodejs)

    // Step 2: health report — uses the same manifest content so same resolver state
    const healthTool = createGetHealthReportTool(resolver)
    const report = await healthTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })
    expect(report.ecosystem).toBe(tree.ecosystem)

    // Extract one flagged package from the health report to compare
    const allSignals = [...report.critical, ...report.warning, ...report.advisory]
    expect(allSignals.length).toBeGreaterThan(0)
    const flaggedPackage = allSignals[0].package.name as string

    // Step 3: compare alternatives for the flagged package
    const compareTool = createCompareAlternativeTool()
    const comparison = await compareTool.handler({ packageName: flaggedPackage, ecosystem: Ecosystem.nodejs })
    expect(comparison.packageName).toBe(flaggedPackage)
    expect(comparison.ecosystem).toBe(Ecosystem.nodejs)
    // Result is either alternatives found or an empty list for unknown packages
    expect(Array.isArray(comparison.alternatives)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Journey 2: "License audit"
//   analyze_dependency_tree → get_transitive_license_conflicts
//   MIT project with a direct GPL-3.0 dependency — must surface a critical conflict
// ---------------------------------------------------------------------------
describe('Journey 2: License audit', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  it('step 1 — analyze_dependency_tree resolves the GPL fixture', async () => {
    mockNpmGpl()
    const resolver = buildResolver()
    const treeTool = createAnalyzeDependencyTreeTool(resolver)

    const tree = await treeTool.handler({ content: GPL_LOCKFILE, includeDevDependencies: false })

    expect(tree.ecosystem).toBe(Ecosystem.nodejs)
    expect(tree.totalDirect).toBe(1)
    expect(tree.root.name).toBe('mit-project')
  })

  it('step 2 — get_transitive_license_conflicts detects GPL-3.0 in a MIT project', async () => {
    mockNpmGpl()
    const resolver = buildResolver()
    const licenseTool = createGetLicenseConflictsTool(resolver)

    const result = await licenseTool.handler({ content: GPL_LOCKFILE, projectLicense: 'MIT' })

    expect(result.ecosystem).toBe(Ecosystem.nodejs)
    expect(result.projectLicense).toBe('MIT')
    expect(result.total).toBe(result.conflicts.length)
    expect(result.total).toBeGreaterThan(0)

    const criticalConflicts = result.conflicts.filter((c: { severity: string }) => c.severity === 'critical')
    expect(criticalConflicts.length).toBeGreaterThan(0)
  })

  it('step 2 — GPL conflict names the offending package', async () => {
    mockNpmGpl()
    const resolver = buildResolver()
    const licenseTool = createGetLicenseConflictsTool(resolver)

    const result = await licenseTool.handler({ content: GPL_LOCKFILE, projectLicense: 'MIT' })

    const gplConflict = result.conflicts.find(
      (c: { packageA: { name: string } }) => c.packageA.name === 'readline-sync',
    )
    expect(gplConflict).toBeDefined()
    expect(gplConflict?.severity).toBe('critical')
    expect(gplConflict?.type).toBe('copyleft_in_proprietary')
  })

  it('step 2 — conflict objects have all required fields', async () => {
    mockNpmGpl()
    const resolver = buildResolver()
    const licenseTool = createGetLicenseConflictsTool(resolver)

    const result = await licenseTool.handler({ content: GPL_LOCKFILE, projectLicense: 'MIT' })

    for (const conflict of result.conflicts) {
      expect(conflict.type).toBeDefined()
      expect(conflict.severity).toMatch(/^(critical|warning|advisory)$/)
      expect(conflict.packageA).toBeDefined()
      expect(Array.isArray(conflict.path)).toBe(true)
      expect(typeof conflict.description).toBe('string')
    }
  })

  it('full journey — no critical conflicts for all-MIT tree', async () => {
    mockNpmStandard()
    const resolver = buildResolver()

    // Step 1
    const treeTool = createAnalyzeDependencyTreeTool(resolver)
    const tree = await treeTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })
    expect(tree.ecosystem).toBe(Ecosystem.nodejs)

    // Step 2 — all packages are MIT, project is MIT → no critical conflicts
    const licenseTool = createGetLicenseConflictsTool(resolver)
    const result = await licenseTool.handler({ content: STANDARD_LOCKFILE, projectLicense: 'MIT' })
    const critical = result.conflicts.filter((c: { severity: string }) => c.severity === 'critical')
    expect(critical).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Journey 3: "Quick dashboard"
//   analyze_dependency_tree → get_ecosystem_summary
//   Verify totalDirect, totalTransitive, and riskScore are populated correctly
// ---------------------------------------------------------------------------
describe('Journey 3: Quick dashboard', () => {
  beforeEach(async () => {
    await setupStack()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await cache.close()
  })

  it('step 1 — analyze_dependency_tree returns correct counts for standard fixture', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const treeTool = createAnalyzeDependencyTreeTool(resolver)

    const tree = await treeTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    expect(tree.totalDirect).toBe(2)                      // lodash + express
    expect(tree.totalTransitive).toBeGreaterThanOrEqual(1) // at least accepts
    expect(tree.ecosystem).toBe(Ecosystem.nodejs)
  })

  it('step 2 — get_ecosystem_summary totalDirect matches 2 production deps', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const summaryTool = createGetEcosystemSummaryTool(resolver)

    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    expect(summary.totalDirect).toBe(2)
  })

  it('step 2 — get_ecosystem_summary totalTransitive is at least 1 (accepts)', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const summaryTool = createGetEcosystemSummaryTool(resolver)

    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    expect(summary.totalTransitive).toBeGreaterThanOrEqual(1)
  })

  it('step 2 — riskScore is a number in the 0–100 range', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const summaryTool = createGetEcosystemSummaryTool(resolver)

    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    expect(typeof summary.riskScore).toBe('number')
    expect(summary.riskScore).toBeGreaterThanOrEqual(0)
    expect(summary.riskScore).toBeLessThanOrEqual(100)
  })

  it('step 2 — summary shape has all required fields', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const summaryTool = createGetEcosystemSummaryTool(resolver)

    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    expect(summary).toHaveProperty('ecosystem')
    expect(summary).toHaveProperty('totalDirect')
    expect(summary).toHaveProperty('totalTransitive')
    expect(summary).toHaveProperty('riskScore')
    expect(summary).toHaveProperty('criticalCount')
    expect(summary).toHaveProperty('warningCount')
    expect(summary).toHaveProperty('advisoryCount')
    expect(summary).toHaveProperty('topActions')
    expect(Array.isArray(summary.topActions)).toBe(true)
    expect(summary.topActions.length).toBeLessThanOrEqual(3)
  })

  it('step 2 — stale lodash produces a non-zero criticalCount', async () => {
    mockNpmStandard()
    const resolver = buildResolver()
    const summaryTool = createGetEcosystemSummaryTool(resolver)

    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    // lodash is 5 years stale → abandonment analysis must flag it as critical
    expect(summary.criticalCount).toBeGreaterThan(0)
  })

  it('full journey — tree counts flow through consistently into summary', async () => {
    mockNpmStandard()
    const resolver = buildResolver()

    // Step 1: resolve
    const treeTool = createAnalyzeDependencyTreeTool(resolver)
    const tree = await treeTool.handler({ content: STANDARD_LOCKFILE, includeDevDependencies: false })

    // Step 2: dashboard
    const summaryTool = createGetEcosystemSummaryTool(resolver)
    const summary = await summaryTool.handler({ content: STANDARD_LOCKFILE })

    // Both tools resolve the same manifest — counts must agree
    expect(summary.ecosystem).toBe(tree.ecosystem)
    expect(summary.totalDirect).toBe(tree.totalDirect)
    expect(summary.totalTransitive).toBe(tree.totalTransitive)
  })
})
