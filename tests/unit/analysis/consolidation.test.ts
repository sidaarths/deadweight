import { describe, it, expect } from 'vitest'
import { analyzeConsolidations } from '../../../src/analysis/consolidation.js'
import type { DependencyTree, DependencyNode } from '../../../src/types/index.js'
import { Ecosystem } from '../../../src/types/index.js'

function makeNode(
  name: string,
  weeklyDownloads: number | null = null,
  deps: DependencyNode[] = [],
): DependencyNode {
  return {
    name,
    version: '1.0.0',
    ecosystem: Ecosystem.nodejs,
    directDependency: true,
    depth: 1,
    dependencies: deps,
    registryMetadata: {
      maintainers: [{ name: 'author' }],
      lastPublishDate: new Date('2023-01-01'),
      weeklyDownloads,
      license: 'MIT',
      repositoryUrl: null,
      description: null,
      homepage: null,
      deprecated: null,
    },
  }
}

function makeTree(nodes: DependencyNode[]): DependencyTree {
  return {
    root: {
      name: 'my-app',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      depth: 0,
      dependencies: nodes,
    },
    ecosystem: Ecosystem.nodejs,
    manifestPath: '/project/package.json',
    totalDirect: nodes.length,
    totalTransitive: 0,
    resolvedAt: new Date(),
  }
}

describe('analyzeConsolidations', () => {
  it('returns empty array for single package per category', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('lodash', 300000),
      makeNode('winston', 200000),
    ])
    const result = analyzeConsolidations(tree)
    expect(result).toHaveLength(0)
  })

  it('detects two HTTP clients as consolidation opportunity', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
    ])
    const result = analyzeConsolidations(tree)
    expect(result.length).toBeGreaterThan(0)
    const consolidation = result.find(c => c.category === 'http-client')
    expect(consolidation).toBeDefined()
    expect(consolidation?.packages.length).toBe(2)
  })

  it('detects two date libraries as consolidation opportunity', () => {
    const tree = makeTree([
      makeNode('moment', 300000),
      makeNode('dayjs', 200000),
    ])
    const result = analyzeConsolidations(tree)
    const consolidation = result.find(c => c.category === 'date-time')
    expect(consolidation).toBeDefined()
  })

  it('recommends the package with highest download count', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
      makeNode('got', 100000),
    ])
    const result = analyzeConsolidations(tree)
    const consolidation = result.find(c => c.category === 'http-client')
    expect(consolidation?.recommendation).toBe('axios')
  })

  it('includes all packages in the group', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
      makeNode('got', 100000),
    ])
    const result = analyzeConsolidations(tree)
    const consolidation = result.find(c => c.category === 'http-client')
    expect(consolidation?.packages).toHaveLength(3)
    const names = consolidation?.packages.map(p => p.name)
    expect(names).toContain('axios')
    expect(names).toContain('node-fetch')
    expect(names).toContain('got')
  })

  it('has a reason string mentioning all packages', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
    ])
    const result = analyzeConsolidations(tree)
    const consolidation = result.find(c => c.category === 'http-client')
    expect(consolidation?.reason).toContain('axios')
    expect(consolidation?.reason).toContain('node-fetch')
  })

  it('sets estimatedSizeSavingsBytes to null', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
    ])
    const result = analyzeConsolidations(tree)
    expect(result[0].estimatedSizeSavingsBytes).toBeNull()
  })

  it('ignores testing category duplicates', () => {
    const tree = makeTree([
      makeNode('jest', 500000),
      makeNode('vitest', 300000),
      makeNode('mocha', 200000),
    ])
    const result = analyzeConsolidations(tree)
    const testingConsolidation = result.find(c => c.category === 'testing')
    expect(testingConsolidation).toBeUndefined()
  })

  it('ignores other category', () => {
    const tree = makeTree([
      makeNode('unknown-pkg-1', 100),
      makeNode('unknown-pkg-2', 100),
    ])
    const result = analyzeConsolidations(tree)
    const otherConsolidation = result.find(c => c.category === 'other')
    expect(otherConsolidation).toBeUndefined()
  })

  it('can detect multiple consolidation opportunities', () => {
    const tree = makeTree([
      makeNode('axios', 500000),
      makeNode('node-fetch', 200000),
      makeNode('moment', 300000),
      makeNode('dayjs', 150000),
    ])
    const result = analyzeConsolidations(tree)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('processes transitive dependencies', () => {
    const transitive1 = { ...makeNode('got', 100000), directDependency: false }
    const tree = makeTree([
      makeNode('axios', 500000),
      { ...makeNode('wrapper', 50000, [transitive1]), dependencies: [transitive1] },
    ])
    const result = analyzeConsolidations(tree)
    const consolidation = result.find(c => c.category === 'http-client')
    expect(consolidation).toBeDefined()
  })

  it('handles package with no registryMetadata when choosing recommendation', () => {
    const noMetaAxios: DependencyNode = {
      name: 'axios',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: true,
      depth: 1,
      dependencies: [],
    }
    const tree = makeTree([noMetaAxios, makeNode('node-fetch', 200000)])
    expect(() => analyzeConsolidations(tree)).not.toThrow()
  })
})
