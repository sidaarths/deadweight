import type { Package } from './package.js'

export enum RiskSeverity {
  critical = 'critical',
  warning = 'warning',
  advisory = 'advisory',
}

export type RiskSignalType =
  | 'single_maintainer'
  | 'abandoned'
  | 'license_conflict'
  | 'consolidation'
  | 'vulnerability'
  | 'deprecated'
  | 'no_repository'

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
