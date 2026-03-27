import type { Package } from './package.js'
import type { RiskSignal, RiskScore } from './risk.js'
import type { Ecosystem } from './ecosystem.js'

export interface HealthReport {
  readonly critical: readonly RiskSignal[]
  readonly warning: readonly RiskSignal[]
  readonly advisory: readonly RiskSignal[]
  score: RiskScore
  readonly topActions: readonly string[]
  generatedAt: Date
}

export interface Consolidation {
  category: string
  readonly packages: readonly Package[]
  recommendation: string
  reason: string
  estimatedSizeSavingsBytes: number | null
}

export interface Alternative {
  name: string
  version: string
  ecosystem: Ecosystem
  weeklyDownloads: number | null
  maintainerCount: number
  lastPublishDaysAgo: number | null
  openIssueRatio: number | null   // open / total issues, 0-1
  score: number                   // 0-100 composite health score
  apiCompatibilityNote?: string
  repositoryUrl?: string
}

export interface EcosystemSummary {
  ecosystem: Ecosystem
  totalDirect: number
  totalTransitive: number
  riskScore: number
  criticalCount: number
  warningCount: number
  advisoryCount: number
  readonly topActions: readonly string[]
}
