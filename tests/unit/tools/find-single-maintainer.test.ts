import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFindSingleMaintainerTool } from '../../../src/tools/find-single-maintainer.js'
import type { TreeResolver } from '../../../src/analysis/tree-resolver.js'
import { Ecosystem, RiskSeverity } from '../../../src/types/index.js'
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

describe('createFindSingleMaintainerTool', () => {
  it('has the correct tool name', () => {
    const tool = createFindSingleMaintainerTool(makeResolver(makeTree()))
    expect(tool.name).toBe('find_single_maintainer_dependencies')
  })

  it('has a description', () => {
    const tool = createFindSingleMaintainerTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns empty signals for tree with no packages', async () => {
    const tool = createFindSingleMaintainerTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', minDependents: 0 })
    expect(result.signals).toEqual([])
    expect(result.total).toBe(0)
  })

  it('flags a single-maintainer package', async () => {
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
              maintainers: [{ name: 'solo-author' }],
              lastPublishDate: new Date(),
              weeklyDownloads: 1000,
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
    const tool = createFindSingleMaintainerTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', minDependents: 0 })
    expect(result.total).toBeGreaterThan(0)
    expect(result.signals[0].package.name).toBe('risky-pkg')
    expect(result.signals[0].type).toBe('single_maintainer')
  })

  it('does not flag a multi-maintainer package', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'safe-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'author-a' }, { name: 'author-b' }],
              lastPublishDate: new Date(),
              weeklyDownloads: 50000,
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
    const tool = createFindSingleMaintainerTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', minDependents: 0 })
    expect(result.signals).toHaveLength(0)
  })

  it('includes ecosystem in output', async () => {
    const tool = createFindSingleMaintainerTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', minDependents: 0 })
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
  })

  it('all returned signals have required fields', async () => {
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
              lastPublishDate: new Date(),
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
    const tool = createFindSingleMaintainerTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', minDependents: 0 })
    for (const signal of result.signals) {
      expect(signal.type).toBeDefined()
      expect(signal.severity).toMatch(/^(critical|warning|advisory)$/)
      expect(signal.score).toBeGreaterThanOrEqual(0)
      expect(signal.score).toBeLessThanOrEqual(100)
      expect(signal.package).toBeDefined()
    }
  })
})
