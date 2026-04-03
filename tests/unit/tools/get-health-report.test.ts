import { describe, it, expect, vi } from 'vitest'
import { createGetHealthReportTool } from '../../../src/tools/get-health-report.js'
import type { TreeResolver } from '../../../src/analysis/tree-resolver.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { DependencyTree } from '../../../src/types/index.js'

const STALE_DATE = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000)

function makeTree(overrides: Partial<DependencyTree> = {}): DependencyTree {
  return {
    root: {
      name: 'my-app',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      depth: 0,
      dependencies: [],
    },
    ecosystem: Ecosystem.nodejs,
    manifestPath: 'package.json',
    totalDirect: 0,
    totalTransitive: 0,
    resolvedAt: new Date(),
    warnings: [],
    ...overrides,
  }
}

function makeResolver(tree: DependencyTree): TreeResolver {
  return { resolve: vi.fn().mockResolvedValue(tree) }
}

describe('createGetHealthReportTool', () => {
  it('has the correct tool name', () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    expect(tool.name).toBe('get_dependency_health_report')
  })

  it('has a description', () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns a well-formed health report for an empty tree', async () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', includeDevDependencies: false })
    expect(Array.isArray(result.critical)).toBe(true)
    expect(Array.isArray(result.warning)).toBe(true)
    expect(Array.isArray(result.advisory)).toBe(true)
    expect(Array.isArray(result.topActions)).toBe(true)
    expect(typeof result.score.overall).toBe('number')
    expect(typeof result.generatedAt).toBe('string')
  })

  it('score fields are in 0-100 range', async () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', includeDevDependencies: false })
    expect(result.score.overall).toBeGreaterThanOrEqual(0)
    expect(result.score.overall).toBeLessThanOrEqual(100)
    expect(result.score.maintainer).toBeGreaterThanOrEqual(0)
    expect(result.score.abandonment).toBeGreaterThanOrEqual(0)
    expect(result.score.license).toBeGreaterThanOrEqual(0)
    expect(result.score.consolidation).toBeGreaterThanOrEqual(0)
  })

  it('aggregates signals from all analysis engines', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'risky-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'solo' }],
              lastPublishDate: STALE_DATE,
              weeklyDownloads: 1000,
              license: 'GPL-3.0',
              repositoryUrl: null,
              description: null,
              homepage: null,
              deprecated: null,
            },
          },
        ],
      },
      totalDirect: 1,
    })
    const tool = createGetHealthReportTool(makeResolver(tree))
    const result = await tool.handler({
      content: '{}',
      includeDevDependencies: false,
    })
    const allSignals = [...result.critical, ...result.warning, ...result.advisory]
    expect(allSignals.length).toBeGreaterThan(0)
  })

  it('topActions contains at most 5 entries', async () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', includeDevDependencies: false })
    expect(result.topActions.length).toBeLessThanOrEqual(5)
  })

  it('generatedAt is an ISO string', async () => {
    const tool = createGetHealthReportTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', includeDevDependencies: false })
    expect(() => new Date(result.generatedAt)).not.toThrow()
  })
})
