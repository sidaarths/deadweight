import { describe, it, expect, vi } from 'vitest'
import { analyzeMaintainerRisk } from '../../../src/analysis/maintainer-risk.js'
import type { DependencyTree, DependencyNode } from '../../../src/types/index.js'
import { Ecosystem } from '../../../src/types/index.js'

function makeNode(
  name: string,
  maintainerCount: number,
  weeklyDownloads: number | null = null,
  directDependency = true,
  repositoryUrl: string | null = null,
  deps: DependencyNode[] = [],
): DependencyNode {
  const maintainers = Array.from({ length: maintainerCount }, (_, i) => ({ name: `author${i}` }))
  return {
    name,
    version: '1.0.0',
    ecosystem: Ecosystem.nodejs,
    directDependency,
    depth: directDependency ? 1 : 2,
    dependencies: deps,
    registryMetadata: {
      maintainers,
      lastPublishDate: new Date('2023-06-01'),
      weeklyDownloads,
      license: 'MIT',
      repositoryUrl,
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

describe('analyzeMaintainerRisk', () => {
  it('returns empty array for packages with multiple maintainers', async () => {
    const tree = makeTree([makeNode('react', 5, 1_000_000)])
    const signals = await analyzeMaintainerRisk({ tree })
    expect(signals).toHaveLength(0)
  })

  it('flags a package with single maintainer', async () => {
    const tree = makeTree([makeNode('tiny-lib', 1, 5000)])
    const signals = await analyzeMaintainerRisk({ tree })
    expect(signals.length).toBeGreaterThan(0)
    expect(signals[0].type).toBe('single_maintainer')
  })

  it('produces critical signal for single-maintainer high-download direct dep', async () => {
    const tree = makeTree([makeNode('popular-lib', 1, 500_000)])
    const signals = await analyzeMaintainerRisk({ tree })
    const signal = signals.find(s => s.package.name === 'popular-lib')
    expect(signal?.severity).toBe('critical')
    expect(signal?.score).toBe(60)
  })

  it('produces warning signal for single-maintainer low-download direct dep', async () => {
    const tree = makeTree([makeNode('small-lib', 1, 500)])
    const signals = await analyzeMaintainerRisk({ tree })
    const signal = signals.find(s => s.package.name === 'small-lib')
    expect(signal?.severity).toBe('warning')
    expect(signal?.score).toBe(40)
  })

  it('produces warning for single-maintainer transitive dep regardless of downloads', async () => {
    const tree = makeTree([makeNode('transitive-lib', 1, 500_000, false)])
    const signals = await analyzeMaintainerRisk({ tree })
    const signal = signals.find(s => s.package.name === 'transitive-lib')
    expect(signal?.severity).toBe('warning')
  })

  it('message includes maintainer name', async () => {
    const tree = makeTree([makeNode('solo-lib', 1)])
    const signals = await analyzeMaintainerRisk({ tree })
    expect(signals[0].message).toContain('solo-lib')
    expect(signals[0].message).toContain('single maintainer')
  })

  it('includes remediation text', async () => {
    const tree = makeTree([makeNode('solo-lib', 1)])
    const signals = await analyzeMaintainerRisk({ tree })
    expect(signals[0].remediation).toBeDefined()
    expect(signals[0].remediation?.length).toBeGreaterThan(0)
  })

  it('processes packages with no registryMetadata gracefully', async () => {
    const nodeWithoutMeta: DependencyNode = {
      name: 'no-meta-pkg',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: true,
      depth: 1,
      dependencies: [],
    }
    const tree = makeTree([nodeWithoutMeta])
    await expect(analyzeMaintainerRisk({ tree })).resolves.not.toThrow()
  })

  it('processes nested transitive dependencies', async () => {
    const transitive = makeNode('deep-solo', 1, 1000, false)
    const direct = makeNode('direct-multi', 3, 50000, true, null, [transitive])
    const tree = makeTree([direct])
    const signals = await analyzeMaintainerRisk({ tree })
    expect(signals.some(s => s.package.name === 'deep-solo')).toBe(true)
    expect(signals.some(s => s.package.name === 'direct-multi')).toBe(false)
  })

  it('uses GitHub client to upgrade severity when contributorCount is 1', async () => {
    const mockGitHubClient = {
      getRepoHealth: vi.fn().mockResolvedValue({
        lastCommitDate: new Date('2024-01-01'),
        openIssues: 5,
        totalIssues: 10,
        contributorCount: 1,
        isArchived: false,
        stars: 100,
      }),
    }

    const tree = makeTree([makeNode('solo-repo', 1, 5000, true, 'https://github.com/solo/repo')])
    const signals = await analyzeMaintainerRisk({ tree, gitHubClient: mockGitHubClient as any })
    const signal = signals.find(s => s.package.name === 'solo-repo')
    expect(signal?.severity).toBe('critical')
  })

  it('adds archived note to message when repo is archived', async () => {
    const mockGitHubClient = {
      getRepoHealth: vi.fn().mockResolvedValue({
        lastCommitDate: new Date('2020-01-01'),
        openIssues: 0,
        totalIssues: 0,
        contributorCount: 1,
        isArchived: true,
        stars: 10,
      }),
    }

    const tree = makeTree([makeNode('archived-lib', 1, 1000, true, 'https://github.com/solo/archived')])
    const signals = await analyzeMaintainerRisk({ tree, gitHubClient: mockGitHubClient as any })
    const signal = signals.find(s => s.package.name === 'archived-lib')
    expect(signal?.message.toLowerCase()).toContain('archived')
  })

  it('skips GitHub check when getRepoHealth returns null', async () => {
    // health is null → if (health) block is skipped; severity stays at its initial value
    const mockGitHubClient = {
      getRepoHealth: vi.fn().mockResolvedValue(null),
    }

    const tree = makeTree([makeNode('no-health-pkg', 1, 500, true, 'https://github.com/solo/norepo')])
    const signals = await analyzeMaintainerRisk({ tree, gitHubClient: mockGitHubClient as any })
    const signal = signals.find(s => s.package.name === 'no-health-pkg')
    // Should still flag as single_maintainer (with warning, not critical)
    expect(signal).toBeDefined()
    expect(signal?.type).toBe('single_maintainer')
    expect(signal?.severity).toBe('warning')
  })

  it('uses unknown as maintainer name when name property is missing', async () => {
    // Maintainer with no name → message should contain 'unknown'
    const node = {
      name: 'nameless-maintainer-pkg',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: true,
      depth: 1,
      dependencies: [],
      registryMetadata: {
        // maintainers[0] has no name (undefined)
        maintainers: [{}],
        lastPublishDate: new Date(),
        weeklyDownloads: 500,
        license: 'MIT',
        repositoryUrl: null,
        description: null,
        homepage: null,
        deprecated: null,
      },
    }
    const tree = {
      root: {
        name: 'app',
        version: '1.0.0',
        ecosystem: Ecosystem.nodejs,
        directDependency: false,
        depth: 0,
        dependencies: [node],
      },
      ecosystem: Ecosystem.nodejs,
      manifestPath: 'package.json',
      totalDirect: 1,
      totalTransitive: 0,
      resolvedAt: new Date(),
    }
    const signals = await analyzeMaintainerRisk({ tree })
    const signal = signals.find(s => s.package.name === 'nameless-maintainer-pkg')
    expect(signal).toBeDefined()
    expect(signal?.message).toContain('unknown')
  })
})
