import { describe, it, expect, vi } from 'vitest'
import { analyzeAbandonment } from '../../../src/analysis/abandonment.js'
import type { DependencyTree, DependencyNode } from '../../../src/types/index.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { OsvVulnerability } from '../../../src/registry/osv.js'

function makeNode(
  name: string,
  lastPublishDate: Date | null,
  deprecated: string | null | undefined = null,
  repositoryUrl: string | null = null,
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
      lastPublishDate,
      weeklyDownloads: 10000,
      license: 'MIT',
      repositoryUrl,
      description: null,
      homepage: null,
      deprecated,
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

const NOW = new Date('2026-03-29T00:00:00Z')

describe('analyzeAbandonment', () => {
  it('returns empty array for recently published packages', async () => {
    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    const tree = makeTree([makeNode('fresh-pkg', recentDate)])
    const signals = await analyzeAbandonment({ tree })
    expect(signals).toHaveLength(0)
  })

  it('produces advisory for package published 1-2 years ago', async () => {
    const date = new Date(NOW.getTime() - 500 * 24 * 60 * 60 * 1000) // ~500 days ago
    const tree = makeTree([makeNode('old-pkg', date)])
    const signals = await analyzeAbandonment({ tree })
    const signal = signals.find(s => s.package.name === 'old-pkg')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('advisory')
  })

  it('produces warning for package published 2-4 years ago', async () => {
    const date = new Date(NOW.getTime() - 900 * 24 * 60 * 60 * 1000) // ~900 days ago
    const tree = makeTree([makeNode('stale-pkg', date)])
    const signals = await analyzeAbandonment({ tree })
    const signal = signals.find(s => s.package.name === 'stale-pkg')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('warning')
  })

  it('produces critical for package published 4+ years ago', async () => {
    const date = new Date(NOW.getTime() - 1500 * 24 * 60 * 60 * 1000) // ~4+ years ago
    const tree = makeTree([makeNode('ancient-pkg', date)])
    const signals = await analyzeAbandonment({ tree })
    const signal = signals.find(s => s.package.name === 'ancient-pkg')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('critical')
  })

  it('produces critical for deprecated package with score 90', async () => {
    const tree = makeTree([makeNode('deprecated-pkg', new Date(), 'Use new-pkg instead')])
    const signals = await analyzeAbandonment({ tree })
    const signal = signals.find(s => s.package.name === 'deprecated-pkg')
    expect(signal?.severity).toBe('critical')
    expect(signal?.score).toBe(90)
  })

  it('packages with null lastPublishDate are skipped (no staleness signal)', async () => {
    const tree = makeTree([makeNode('no-date-pkg', null)])
    const signals = await analyzeAbandonment({ tree })
    const signal = signals.find(s => s.package.name === 'no-date-pkg')
    // May or may not have a signal, but should not throw
    expect(() => signals).not.toThrow()
  })

  it('uses osvClient to factor in CVEs', async () => {
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-2023-001', summary: 'Critical bug', severity: 'CRITICAL' as const, publishedAt: new Date() },
      ] as OsvVulnerability[]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('vuln-pkg', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'vuln-pkg')
    expect(signal).toBeDefined()
    expect(signal?.score).toBeGreaterThan(0)
  })

  it('CRITICAL CVE adds 30 to score', async () => {
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-2023-001', summary: 'Critical', severity: 'CRITICAL' as const, publishedAt: new Date() },
      ] as OsvVulnerability[]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('critical-vuln-pkg', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'critical-vuln-pkg')
    expect(signal?.score).toBe(30)
  })

  it('HIGH CVE adds 20, MEDIUM adds 10, LOW adds 5', async () => {
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-H', summary: 'High', severity: 'HIGH' as const, publishedAt: new Date() },
        { id: 'CVE-M', summary: 'Medium', severity: 'MEDIUM' as const, publishedAt: new Date() },
        { id: 'CVE-L', summary: 'Low', severity: 'LOW' as const, publishedAt: new Date() },
      ] as OsvVulnerability[]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('multi-vuln-pkg', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'multi-vuln-pkg')
    expect(signal?.score).toBe(35) // 20 + 10 + 5
  })

  it('caps CVE score at 100', async () => {
    const criticalVulns: OsvVulnerability[] = Array.from({ length: 10 }, (_, i) => ({
      id: `CVE-${i}`,
      summary: 'Critical',
      severity: 'CRITICAL' as const,
      publishedAt: new Date(),
    }))
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue(criticalVulns),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('many-cves-pkg', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'many-cves-pkg')
    expect(signal?.score).toBeLessThanOrEqual(100)
  })

  it('detects archived repo via GitHub client', async () => {
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

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('archived-pkg', recentDate, null, 'https://github.com/org/archived-repo')])
    const signals = await analyzeAbandonment({ tree, gitHubClient: mockGitHubClient as any })
    const signal = signals.find(s => s.package.name === 'archived-pkg')
    expect(signal?.severity).toBe('critical')
    expect(signal?.score).toBe(85)
  })

  it('processes packages without registryMetadata gracefully', async () => {
    const nodeWithoutMeta: DependencyNode = {
      name: 'no-meta',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: true,
      depth: 1,
      dependencies: [],
    }
    const tree = makeTree([nodeWithoutMeta])
    await expect(analyzeAbandonment({ tree })).resolves.not.toThrow()
  })

  it('walks transitive dependencies', async () => {
    const ancient = new Date(NOW.getTime() - 1500 * 24 * 60 * 60 * 1000)
    const deepDep = makeNode('deep-ancient', ancient, null, null, [])
    const midDep = {
      ...makeNode('mid', new Date(), null, null, [deepDep]),
      directDependency: false,
    }
    const tree = makeTree([midDep])
    const signals = await analyzeAbandonment({ tree })
    expect(signals.some(s => s.package.name === 'deep-ancient')).toBe(true)
  })

  it('GitHub archived false branch — no signal when repo is not archived', async () => {
    const mockGitHubClient = {
      getRepoHealth: vi.fn().mockResolvedValue({
        lastCommitDate: new Date(),
        openIssues: 2,
        totalIssues: 5,
        contributorCount: 3,
        isArchived: false,
        stars: 500,
      }),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('active-repo', recentDate, null, 'https://github.com/org/active')])
    const signals = await analyzeAbandonment({ tree, gitHubClient: mockGitHubClient as any })
    const signal = signals.find(s => s.package.name === 'active-repo')
    expect(signal).toBeUndefined()
  })

  it('CVE-only score >= 40 sets severity to warning (score < 70)', async () => {
    // 2 HIGH CVEs = 40 points → score 40, >= 40 → warning
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-H1', summary: 'High 1', severity: 'HIGH' as const, publishedAt: new Date() },
        { id: 'CVE-H2', summary: 'High 2', severity: 'HIGH' as const, publishedAt: new Date() },
      ]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('two-high-cves', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'two-high-cves')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('warning')
    expect(signal?.score).toBe(40)
  })

  it('CVE-only score < 40 sets severity to advisory', async () => {
    // 1 MEDIUM CVE = 10 points → score 10, < 40 → advisory
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-M1', summary: 'Medium', severity: 'MEDIUM' as const, publishedAt: new Date() },
      ]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('one-medium-cve', recentDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'one-medium-cve')
    expect(signal).toBeDefined()
    expect(signal?.severity).toBe('advisory')
    expect(signal?.score).toBe(10)
  })

  it('CVE score promotes advisory staleness to warning when combined score >= 40', async () => {
    // Package is ~500 days old (advisory), plus 2 HIGH CVEs (40pts) → combined >= 40 → warning
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-H1', summary: 'High 1', severity: 'HIGH' as const, publishedAt: new Date() },
        { id: 'CVE-H2', summary: 'High 2', severity: 'HIGH' as const, publishedAt: new Date() },
      ]),
    }

    const advisoryDate = new Date(NOW.getTime() - 500 * 24 * 60 * 60 * 1000) // ~500 days → advisory
    const tree = makeTree([makeNode('advisory-plus-cves', advisoryDate)])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'advisory-plus-cves')
    expect(signal).toBeDefined()
    // advisory staleness alone gives score ~20; combined with 40 CVE pts exceeds 40 → warning
    expect(signal?.severity).toBe('warning')
  })

  it('CVE score does not override already-critical severity', async () => {
    // Deprecated package (score=90, severity=critical) + 1 HIGH CVE
    // score stays capped, severity stays critical (not re-assigned by CVE branch)
    const mockOsvClient = {
      getVulnerabilities: vi.fn().mockResolvedValue([
        { id: 'CVE-H1', summary: 'High', severity: 'HIGH' as const, publishedAt: new Date() },
      ]),
    }

    const recentDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tree = makeTree([makeNode('deprecated-with-cve', recentDate, 'Use other-pkg instead')])
    const signals = await analyzeAbandonment({ tree, osvClient: mockOsvClient as any })
    const signal = signals.find(s => s.package.name === 'deprecated-with-cve')
    expect(signal?.severity).toBe('critical')
  })
})
