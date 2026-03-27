import type { Package } from './package.js'

// Use const object instead of enum: tree-shakeable, JSON-safe, Zod-compatible
export const RiskSeverity = {
  critical: 'critical',
  warning: 'warning',
  advisory: 'advisory',
} as const
export type RiskSeverity = typeof RiskSeverity[keyof typeof RiskSeverity]

export const RISK_SIGNAL_TYPES = [
  'single_maintainer',
  'abandoned',
  'license_conflict',
  'consolidation',
  'vulnerability',
  'deprecated',
  'no_repository',
] as const
export type RiskSignalType = typeof RISK_SIGNAL_TYPES[number]

export interface RiskSignal {
  type: RiskSignalType
  severity: RiskSeverity
  package: Package
  message: string
  score: number        // 0-100, higher = more risk
  actionable: boolean
  remediation?: string
  alternatives?: string[]
}

export interface RiskScore {
  overall: number        // 0-100
  maintainer: number
  abandonment: number
  license: number
  consolidation: number
}
