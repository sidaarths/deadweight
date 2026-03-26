import { describe, it, expect } from 'vitest'
import type { HealthReport, Consolidation, Alternative, EcosystemSummary } from '@/types/analysis'
import { RiskSeverity } from '@/types/risk'
import { Ecosystem } from '@/types/ecosystem'

describe('Analysis types', () => {
  it('creates a valid HealthReport', () => {
    const report: HealthReport = {
      critical: [],
      warning: [],
      advisory: [],
      score: { overall: 95, maintainer: 100, abandonment: 95, license: 100, consolidation: 80 },
      topActions: ['Update lodash to address single-maintainer risk'],
      generatedAt: new Date(),
    }
    expect(report.critical).toHaveLength(0)
    expect(report.topActions).toHaveLength(1)
  })

  it('creates a valid Consolidation suggestion', () => {
    const suggestion: Consolidation = {
      category: 'http-client',
      packages: [
        { name: 'axios', version: '1.0.0', ecosystem: Ecosystem.nodejs, directDependency: true },
        { name: 'got', version: '12.0.0', ecosystem: Ecosystem.nodejs, directDependency: true },
      ],
      recommendation: 'axios',
      reason: 'axios has 10x more weekly downloads and more maintainers',
      estimatedSizeSavingsBytes: 45_000,
    }
    expect(suggestion.packages).toHaveLength(2)
    expect(suggestion.recommendation).toBe('axios')
  })

  it('creates a valid Alternative', () => {
    const alt: Alternative = {
      name: 'dayjs',
      version: '1.11.10',
      ecosystem: Ecosystem.nodejs,
      weeklyDownloads: 15_000_000,
      maintainerCount: 3,
      lastPublishDaysAgo: 45,
      openIssueRatio: 0.3,
      score: 88,
      apiCompatibilityNote: 'Mostly compatible with moment.js API. Missing some locale plugins.',
    }
    expect(alt.score).toBe(88)
    expect(alt.openIssueRatio).toBeLessThan(1)
  })

  it('creates a valid EcosystemSummary', () => {
    const summary: EcosystemSummary = {
      ecosystem: Ecosystem.nodejs,
      totalDirect: 24,
      totalTransitive: 312,
      riskScore: 67,
      criticalCount: 2,
      warningCount: 8,
      advisoryCount: 15,
      topActions: ['Replace deprecated request with got', 'Consolidate 3 HTTP clients to 1'],
    }
    expect(summary.totalTransitive).toBe(312)
    expect(summary.topActions).toHaveLength(2)
  })
})
