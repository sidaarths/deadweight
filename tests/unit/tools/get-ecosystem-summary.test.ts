import { describe, it, expect, vi } from 'vitest'
import { createGetEcosystemSummaryTool } from '../../../src/tools/get-ecosystem-summary.js'
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

describe('createGetEcosystemSummaryTool', () => {
  it('has the correct tool name', () => {
    const tool = createGetEcosystemSummaryTool(makeResolver(makeTree()))
    expect(tool.name).toBe('get_ecosystem_summary')
  })

  it('has a description', () => {
    const tool = createGetEcosystemSummaryTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns ecosystem summary shape for empty tree', async () => {
    const tool = createGetEcosystemSummaryTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}' })
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
    const tool = createGetEcosystemSummaryTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}' })
    expect(result.riskScore).toBeGreaterThanOrEqual(0)
    expect(result.riskScore).toBeLessThanOrEqual(100)
  })

  it('totalDirect matches the tree', async () => {
    const tree = makeTree({ totalDirect: 5, totalTransitive: 12 })
    const tool = createGetEcosystemSummaryTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}' })
    expect(result.totalDirect).toBe(5)
    expect(result.totalTransitive).toBe(12)
  })

  it('criticalCount reflects actual critical signals', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'stale-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'solo' }],
              lastPublishDate: STALE_DATE,
              weeklyDownloads: 100,
              license: 'MIT',
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
    const tool = createGetEcosystemSummaryTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}' })
    expect(result.criticalCount + result.warningCount + result.advisoryCount).toBeGreaterThan(0)
  })
})
