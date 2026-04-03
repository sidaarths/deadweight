import { describe, it, expect, vi } from 'vitest'
import { createFlagAbandonedTool } from '../../../src/tools/flag-abandoned.js'
import type { TreeResolver } from '../../../src/analysis/tree-resolver.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { DependencyTree } from '../../../src/types/index.js'

const STALE_DATE = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) // 5 years ago
const RECENT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)     // 30 days ago

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

describe('createFlagAbandonedTool', () => {
  it('has the correct tool name', () => {
    const tool = createFlagAbandonedTool(makeResolver(makeTree()))
    expect(tool.name).toBe('flag_abandoned_dependencies')
  })

  it('has a description', () => {
    const tool = createFlagAbandonedTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns empty signals for tree with no packages', async () => {
    const tool = createFlagAbandonedTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', maxAgeYears: 2 })
    expect(result.signals).toEqual([])
    expect(result.total).toBe(0)
  })

  it('flags a stale package (published 5 years ago)', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'old-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'author' }],
              lastPublishDate: STALE_DATE,
              weeklyDownloads: 5000,
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
    const tool = createFlagAbandonedTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', maxAgeYears: 2 })
    expect(result.total).toBeGreaterThan(0)
    const signal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'old-pkg')
    expect(signal).toBeDefined()
    expect(signal?.type).toBe('abandoned')
  })

  it('does not flag a recently published package', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'fresh-pkg',
            version: '2.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'author' }],
              lastPublishDate: RECENT_DATE,
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
    const tool = createFlagAbandonedTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', maxAgeYears: 2 })
    const signal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'fresh-pkg')
    expect(signal).toBeUndefined()
  })

  it('flags deprecated packages regardless of age', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'deprecated-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [{ name: 'author' }],
              lastPublishDate: RECENT_DATE,
              weeklyDownloads: 100,
              license: 'MIT',
              repositoryUrl: null,
              description: null,
              homepage: null,
              deprecated: 'Use new-pkg instead',
            },
          },
        ],
      },
      totalDirect: 1,
    })
    const tool = createFlagAbandonedTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', maxAgeYears: 2 })
    const signal = result.signals.find((s: { package: { name: string } }) => s.package.name === 'deprecated-pkg')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('critical')
  })

  it('includes ecosystem in output', async () => {
    const tool = createFlagAbandonedTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', maxAgeYears: 2 })
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
  })
})
