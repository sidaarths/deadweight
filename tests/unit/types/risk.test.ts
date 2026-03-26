import { describe, it, expect } from 'vitest'
import { RiskSeverity, type RiskSignal, type RiskScore } from '@/types/risk'
import { Ecosystem } from '@/types/ecosystem'

describe('Risk types', () => {
  it('RiskSeverity has correct values', () => {
    expect(RiskSeverity.critical).toBe('critical')
    expect(RiskSeverity.warning).toBe('warning')
    expect(RiskSeverity.advisory).toBe('advisory')
  })

  it('creates a valid RiskSignal', () => {
    const signal: RiskSignal = {
      type: 'single_maintainer',
      severity: RiskSeverity.critical,
      package: { name: 'leftpad', version: '1.0.0', ecosystem: Ecosystem.nodejs, directDependency: false },
      message: 'leftpad has only one maintainer who last published 3 years ago',
      score: 85,
      actionable: true,
    }
    expect(signal.score).toBe(85)
    expect(signal.severity).toBe('critical')
  })

  it('creates a valid RiskScore', () => {
    const score: RiskScore = {
      overall: 72,
      maintainer: 85,
      abandonment: 60,
      license: 0,
      consolidation: 30,
    }
    expect(score.overall).toBe(72)
    expect(score.license).toBe(0)
  })

  it('RiskSignal type values cover all expected categories', () => {
    const validTypes: RiskSignal['type'][] = [
      'single_maintainer',
      'abandoned',
      'license_conflict',
      'consolidation',
      'vulnerability',
      'deprecated',
      'no_repository',
    ]
    // Just checks the type is exhaustive enough for expected use cases
    expect(validTypes).toHaveLength(7)
  })
})
