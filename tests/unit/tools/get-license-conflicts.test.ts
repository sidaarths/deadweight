import { describe, it, expect, vi } from 'vitest'
import { createGetLicenseConflictsTool } from '../../../src/tools/get-license-conflicts.js'
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

describe('createGetLicenseConflictsTool', () => {
  it('has the correct tool name', () => {
    const tool = createGetLicenseConflictsTool(makeResolver(makeTree()))
    expect(tool.name).toBe('get_transitive_license_conflicts')
  })

  it('has a description', () => {
    const tool = createGetLicenseConflictsTool(makeResolver(makeTree()))
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns no conflicts for an all-MIT tree with MIT project', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'mit-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [],
              lastPublishDate: null,
              weeklyDownloads: null,
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
    const tool = createGetLicenseConflictsTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', projectLicense: 'MIT' })
    expect(result.conflicts).toHaveLength(0)
  })

  it('flags GPL-3.0 dependency in a MIT project', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'gpl-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [],
              lastPublishDate: null,
              weeklyDownloads: null,
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
    const tool = createGetLicenseConflictsTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', projectLicense: 'MIT' })
    expect(result.total).toBeGreaterThan(0)
    const conflict = result.conflicts.find((c: { packageA: { name: string } }) => c.packageA.name === 'gpl-pkg')
    expect(conflict).toBeDefined()
    expect(conflict?.severity).toBe('critical')
  })

  it('works without a projectLicense', async () => {
    const tool = createGetLicenseConflictsTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}' })
    expect(Array.isArray(result.conflicts)).toBe(true)
  })

  it('includes ecosystem in output', async () => {
    const tool = createGetLicenseConflictsTool(makeResolver(makeTree()))
    const result = await tool.handler({ content: '{}', projectLicense: 'MIT' })
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
  })

  it('conflict objects have required fields', async () => {
    const tree = makeTree({
      root: {
        name: 'my-app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [
          {
            name: 'agpl-pkg',
            version: '1.0.0',
            ecosystem: Ecosystem.nodejs,
            directDependency: true,
            depth: 1,
            dependencies: [],
            registryMetadata: {
              maintainers: [],
              lastPublishDate: null,
              weeklyDownloads: null,
              license: 'AGPL-3.0',
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
    const tool = createGetLicenseConflictsTool(makeResolver(tree))
    const result = await tool.handler({ content: '{}', projectLicense: 'MIT' })
    for (const conflict of result.conflicts) {
      expect(conflict.type).toBeDefined()
      expect(conflict.severity).toMatch(/^(critical|warning|advisory)$/)
      expect(conflict.packageA).toBeDefined()
      expect(Array.isArray(conflict.path)).toBe(true)
    }
  })
})
