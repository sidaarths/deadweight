import { describe, it, expect } from 'vitest'
import { buildHealthReport } from '../../../src/analysis/health-report.js'
import type { RiskSignal, LicenseConflict, Consolidation, DependencyTree } from '../../../src/types/index.js'
import { Ecosystem } from '../../../src/types/index.js'

function makePackage(name: string) {
  return {
    name,
    version: '1.0.0',
    ecosystem: Ecosystem.nodejs,
    directDependency: true,
  }
}

function makeSignal(
  type: RiskSignal['type'],
  severity: RiskSignal['severity'],
  packageName: string,
  score: number,
  message = `Issue with ${packageName}`,
): RiskSignal {
  return {
    type,
    severity,
    package: makePackage(packageName),
    message,
    score,
    actionable: true,
  }
}

function makeLicenseConflict(
  type: LicenseConflict['type'],
  severity: LicenseConflict['severity'],
  packageName: string,
): LicenseConflict {
  return {
    type,
    severity,
    packageA: makePackage(packageName),
    packageB: null,
    description: `License conflict for ${packageName}`,
    path: [packageName],
  }
}

function makeConsolidation(category: string, packages: string[]): Consolidation {
  return {
    category,
    packages: packages.map(makePackage),
    recommendation: packages[0],
    reason: `Multiple packages solving the same problem: ${packages.join(', ')}`,
    estimatedSizeSavingsBytes: null,
  }
}

function makeTree(): DependencyTree {
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
    manifestPath: '/project/package.json',
    totalDirect: 0,
    totalTransitive: 0,
    resolvedAt: new Date(),
  }
}

describe('buildHealthReport', () => {
  it('returns empty report for empty inputs', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.critical).toHaveLength(0)
    expect(report.warning).toHaveLength(0)
    expect(report.advisory).toHaveLength(0)
    expect(report.topActions).toHaveLength(0)
  })

  it('groups signals by severity', () => {
    const report = buildHealthReport({
      maintainerSignals: [
        makeSignal('single_maintainer', 'critical', 'pkg-a', 60),
        makeSignal('single_maintainer', 'warning', 'pkg-b', 40),
      ],
      abandonmentSignals: [
        makeSignal('abandoned', 'advisory', 'pkg-c', 20),
      ],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.critical).toHaveLength(1)
    expect(report.warning).toHaveLength(1)
    expect(report.advisory).toHaveLength(1)
  })

  it('converts LicenseConflict to RiskSignal with type license_conflict', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [makeLicenseConflict('copyleft_in_proprietary', 'critical', 'gpl-lib')],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.critical.some(s => s.type === 'license_conflict')).toBe(true)
  })

  it('converts Consolidation to RiskSignal with type consolidation and advisory severity', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [makeConsolidation('http-client', ['axios', 'node-fetch'])],
      tree: makeTree(),
    })
    expect(report.advisory.some(s => s.type === 'consolidation')).toBe(true)
  })

  it('deduplicates signals by (packageName, type) keeping highest severity', () => {
    const report = buildHealthReport({
      maintainerSignals: [makeSignal('single_maintainer', 'warning', 'pkg-dup', 40)],
      abandonmentSignals: [makeSignal('single_maintainer', 'critical', 'pkg-dup', 60)],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    // Should have only one signal for pkg-dup of type single_maintainer
    const dupSignals = [...report.critical, ...report.warning, ...report.advisory].filter(
      s => s.package.name === 'pkg-dup' && s.type === 'single_maintainer'
    )
    expect(dupSignals).toHaveLength(1)
    expect(dupSignals[0].severity).toBe('critical')
  })

  it('sorts critical signals by score desc', () => {
    const report = buildHealthReport({
      maintainerSignals: [
        makeSignal('single_maintainer', 'critical', 'pkg-low', 30),
        makeSignal('abandoned', 'critical', 'pkg-high', 80),
        makeSignal('deprecated', 'critical', 'pkg-mid', 60),
      ],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.critical[0].score).toBe(80)
    expect(report.critical[1].score).toBe(60)
    expect(report.critical[2].score).toBe(30)
  })

  it('computes RiskScore.maintainer as average of maintainer signal scores', () => {
    const report = buildHealthReport({
      maintainerSignals: [
        makeSignal('single_maintainer', 'critical', 'pkg-a', 60),
        makeSignal('single_maintainer', 'warning', 'pkg-b', 40),
      ],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.score.maintainer).toBe(50) // avg of 60, 40
  })

  it('computes RiskScore.maintainer as 0 when no maintainer signals', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.score.maintainer).toBe(0)
  })

  it('computes RiskScore.abandonment as average of abandonment signal scores', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [
        makeSignal('abandoned', 'critical', 'pkg-a', 70),
        makeSignal('abandoned', 'warning', 'pkg-b', 30),
      ],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.score.abandonment).toBe(50) // avg of 70, 30
  })

  it('computes RiskScore.license as max score of license signals', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [
        makeLicenseConflict('copyleft_in_proprietary', 'critical', 'pkg-a'),
        makeLicenseConflict('agpl_network_use', 'warning', 'pkg-b'),
      ],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.score.license).toBeGreaterThan(0)
  })

  it('computes RiskScore.consolidation as count * 5 capped at 50', () => {
    const consolidations = Array.from({ length: 12 }, (_, i) =>
      makeConsolidation(`category-${i}`, [`pkg-a-${i}`, `pkg-b-${i}`])
    )
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations,
      tree: makeTree(),
    })
    expect(report.score.consolidation).toBe(50) // capped
  })

  it('computes RiskScore.consolidation correctly for small count', () => {
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [makeConsolidation('http-client', ['axios', 'got'])],
      tree: makeTree(),
    })
    expect(report.score.consolidation).toBe(5)
  })

  it('computes RiskScore.overall as weighted average', () => {
    const report = buildHealthReport({
      maintainerSignals: [makeSignal('single_maintainer', 'critical', 'a', 100)],
      abandonmentSignals: [makeSignal('abandoned', 'critical', 'b', 100)],
      licenseConflicts: [makeLicenseConflict('copyleft_in_proprietary', 'critical', 'c')],
      consolidations: [makeConsolidation('http-client', ['axios', 'got'])],
      tree: makeTree(),
    })
    // overall = maintainer*0.3 + abandonment*0.3 + license*0.3 + consolidation*0.1
    expect(report.score.overall).toBeGreaterThan(0)
    expect(report.score.overall).toBeLessThanOrEqual(100)
  })

  it('topActions includes first 3 critical messages then first 2 warnings', () => {
    const report = buildHealthReport({
      maintainerSignals: [
        makeSignal('single_maintainer', 'critical', 'pkg1', 90, 'Critical 1'),
        makeSignal('single_maintainer', 'critical', 'pkg2', 80, 'Critical 2'),
        makeSignal('single_maintainer', 'critical', 'pkg3', 70, 'Critical 3'),
        makeSignal('single_maintainer', 'critical', 'pkg4', 60, 'Critical 4'),
      ],
      abandonmentSignals: [
        makeSignal('abandoned', 'warning', 'pkg5', 40, 'Warning 1'),
        makeSignal('abandoned', 'warning', 'pkg6', 35, 'Warning 2'),
        makeSignal('abandoned', 'warning', 'pkg7', 30, 'Warning 3'),
      ],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    expect(report.topActions).toHaveLength(5)
    expect(report.topActions[0]).toBe('Critical 1')
    expect(report.topActions[3]).toBe('Warning 1')
  })

  it('topActions deduplicates messages', () => {
    const report = buildHealthReport({
      maintainerSignals: [
        makeSignal('single_maintainer', 'critical', 'pkg1', 90, 'Same message'),
        makeSignal('abandoned', 'critical', 'pkg1', 80, 'Same message'),
      ],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    const sameMessageCount = report.topActions.filter(a => a === 'Same message').length
    expect(sameMessageCount).toBe(1)
  })

  it('sets generatedAt to a recent Date', () => {
    const before = new Date()
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    const after = new Date()
    expect(report.generatedAt).toBeInstanceOf(Date)
    expect(report.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(report.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('consolidation with zero packages is filtered out (null from consolidationToSignal)', () => {
    // Consolidation with empty packages array → consolidationToSignal returns null → filtered
    const emptyConsolidation: Consolidation = {
      category: 'http-client',
      packages: [],
      recommendation: 'axios',
      reason: 'No packages',
      estimatedSizeSavingsBytes: null,
    }
    const report = buildHealthReport({
      maintainerSignals: [],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [emptyConsolidation],
      tree: makeTree(),
    })
    // Should not appear in advisory since it was filtered
    expect(report.advisory).toHaveLength(0)
  })

  it('deduplication keeps higher score when severity is equal', () => {
    // Two signals for the same package+type, same severity, different score
    const lowScore = makeSignal('single_maintainer', 'warning', 'pkg-x', 30)
    const highScore = makeSignal('single_maintainer', 'warning', 'pkg-x', 60)
    const report = buildHealthReport({
      maintainerSignals: [lowScore, highScore],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    const allSignals = [...report.critical, ...report.warning, ...report.advisory]
    const pkgSignals = allSignals.filter(s => s.package.name === 'pkg-x')
    expect(pkgSignals).toHaveLength(1)
    expect(pkgSignals[0].score).toBe(60)
  })

  it('deduplication keeps higher severity over lower', () => {
    const warningFirst = makeSignal('single_maintainer', 'warning', 'pkg-y', 40)
    const criticalSecond = makeSignal('single_maintainer', 'critical', 'pkg-y', 60)
    const report = buildHealthReport({
      maintainerSignals: [warningFirst, criticalSecond],
      abandonmentSignals: [],
      licenseConflicts: [],
      consolidations: [],
      tree: makeTree(),
    })
    const allSignals = [...report.critical, ...report.warning, ...report.advisory]
    const pkgSignals = allSignals.filter(s => s.package.name === 'pkg-y')
    expect(pkgSignals).toHaveLength(1)
    expect(pkgSignals[0].severity).toBe('critical')
  })
})
