import { describe, it, expect } from 'vitest'
import { Ecosystem } from '@/types/ecosystem'
import type { Package, Maintainer, RegistryMetadata, DependencyNode, DependencyTree } from '@/types/package'

describe('Package type structure', () => {
  it('creates a minimal valid Package', () => {
    const pkg: Package = {
      name: 'lodash',
      version: '4.17.21',
      ecosystem: Ecosystem.nodejs,
      directDependency: true,
    }
    expect(pkg.name).toBe('lodash')
    expect(pkg.directDependency).toBe(true)
    expect(pkg.registryMetadata).toBeUndefined()
  })

  it('creates a Package with full RegistryMetadata', () => {
    const meta: RegistryMetadata = {
      maintainers: [{ name: 'jdalton', email: 'john.david.dalton@gmail.com' }],
      lastPublishDate: new Date('2021-02-20'),
      weeklyDownloads: 50_000_000,
      license: 'MIT',
      repositoryUrl: 'https://github.com/lodash/lodash',
      description: 'Lodash modular utilities.',
    }
    const pkg: Package = {
      name: 'lodash',
      version: '4.17.21',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      registryMetadata: meta,
    }
    expect(pkg.registryMetadata?.weeklyDownloads).toBe(50_000_000)
    expect(pkg.registryMetadata?.maintainers).toHaveLength(1)
  })

  it('creates a DependencyNode with nested children', () => {
    const child: DependencyNode = {
      name: 'balanced-match',
      version: '1.0.2',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      dependencies: [],
      depth: 2,
    }
    const parent: DependencyNode = {
      name: 'brace-expansion',
      version: '2.0.1',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      dependencies: [child],
      depth: 1,
    }
    expect(parent.dependencies).toHaveLength(1)
    expect(parent.dependencies[0].name).toBe('balanced-match')
    expect(child.depth).toBe(2)
  })

  it('creates a DependencyTree with stats', () => {
    const tree: DependencyTree = {
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: true,
        dependencies: [],
        depth: 0,
      },
      ecosystem: Ecosystem.nodejs,
      manifestPath: '/path/to/package.json',
      totalDirect: 5,
      totalTransitive: 42,
      resolvedAt: new Date(),
    }
    expect(tree.totalTransitive).toBe(42)
    expect(tree.root.depth).toBe(0)
  })
})
