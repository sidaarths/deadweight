import { describe, it, expect, vi } from 'vitest'
import { createSuggestConsolidationsTool } from '../../../src/tools/suggest-consolidations.js'
import type { TreeResolver } from '../../../src/analysis/tree-resolver.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { DependencyTree } from '../../../src/types/index.js'

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

describe('createSuggestConsolidationsTool', () => {
  it('has the correct tool name', () => {
    const tool = createSuggestConsolidationsTool(makeResolver(makeTree()))
    expect(tool.name).toBe('suggest_consolidations')
  })

  it('has a description', () => {
    const tool = createSuggestConsolidationsTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns empty consolidations for tree with no packages', async () => {
    const tool = createSuggestConsolidationsTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}' })
    expect(result.consolidations).toEqual([])
    expect(result.total).toBe(0)
  })

  it('detects duplicate HTTP clients', async () => {
    const tree = makeTree({
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
      totalDirect: 2,
    })
    const tool = createSuggestConsolidationsTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}' })
    expect(result.total).toBeGreaterThan(0)
    const httpConsolidation = result.consolidations.find(
      (c: { category: string }) => c.category === 'http-client',
    )
    expect(httpConsolidation).toBeDefined()
    expect(httpConsolidation?.recommendation).toBe('axios')
  })

  it('consolidation objects have required fields', async () => {
    const tree = makeTree({
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
              maintainers: [],
              lastPublishDate: null,
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
              maintainers: [],
              lastPublishDate: null,
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
      totalDirect: 2,
    })
    const tool = createSuggestConsolidationsTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}' })
    for (const c of result.consolidations) {
      expect(typeof c.category).toBe('string')
      expect(typeof c.recommendation).toBe('string')
      expect(typeof c.reason).toBe('string')
      expect(Array.isArray(c.packages)).toBe(true)
    }
  })

  it('includes ecosystem in output', async () => {
    const tool = createSuggestConsolidationsTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}' })
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
  })
})
