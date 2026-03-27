import { describe, it, expect } from 'vitest'
import { RiskSeverity, RISK_SIGNAL_TYPES, type RiskSignal, type RiskScore } from '@/types/risk'
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

  it('RISK_SIGNAL_TYPES covers all expected categories', () => {
    // Checks against the authoritative const array — adding a type without updating
    // this test will cause a failure, ensuring the test stays in sync
    expect(RISK_SIGNAL_TYPES).toContain('single_maintainer')
    expect(RISK_SIGNAL_TYPES).toContain('abandoned')
    expect(RISK_SIGNAL_TYPES).toContain('license_conflict')
    expect(RISK_SIGNAL_TYPES).toContain('consolidation')
    expect(RISK_SIGNAL_TYPES).toContain('vulnerability')
    expect(RISK_SIGNAL_TYPES).toContain('deprecated')
    expect(RISK_SIGNAL_TYPES).toContain('no_repository')
    expect(RISK_SIGNAL_TYPES).toHaveLength(7)
  })
})
