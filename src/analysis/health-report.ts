import type {
  RiskSignal,
  LicenseConflict,
  Consolidation,
  DependencyTree,
  HealthReport,
  RiskScore,
} from '../types/index.js'
import { RiskSeverity } from '../types/index.js'

const SEVERITY_ORDER: Record<RiskSignal['severity'], number> = {
  critical: 3,
  warning: 2,
  advisory: 1,
}

const LICENSE_SIGNAL_SCORES: Record<LicenseConflict['severity'], number> = {
  critical: 80,
  warning: 50,
  advisory: 20,
}

interface HealthReportOptions {
  maintainerSignals: RiskSignal[]
  abandonmentSignals: RiskSignal[]
  licenseConflicts: LicenseConflict[]
  consolidations: Consolidation[]
  tree: DependencyTree
}

function licenseConflictToSignal(conflict: LicenseConflict): RiskSignal {
  return {
    type: 'license_conflict',
    severity: conflict.severity,
    package: conflict.packageA,
    message: conflict.description,
    score: LICENSE_SIGNAL_SCORES[conflict.severity],
    actionable: true,
    remediation: 'Review license compatibility with your project',
  }
}

function consolidationToSignal(c: Consolidation): RiskSignal | null {
  if (c.packages.length === 0) return null
  return {
    type: 'consolidation',
    severity: RiskSeverity.advisory,
    package: c.packages[0],
    message: c.reason,
    score: 10,
    actionable: true,
    remediation: `Consider consolidating to ${c.recommendation}`,
  }
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function buildHealthReport(options: HealthReportOptions): HealthReport {
  const { maintainerSignals, abandonmentSignals, licenseConflicts, consolidations } = options

  const licenseSignals = licenseConflicts.map(licenseConflictToSignal)
  const consolidationSignals = consolidations.map(consolidationToSignal).filter((s): s is RiskSignal => s !== null)

  const allSignals = [
    ...maintainerSignals,
    ...abandonmentSignals,
    ...licenseSignals,
    ...consolidationSignals,
  ]

  // Deduplicate by (packageName, type) keeping highest severity
  const dedupMap = new Map<string, RiskSignal>()
  for (const signal of allSignals) {
    const key = `${signal.package.name}::${signal.type}`
    const existing = dedupMap.get(key)
    if (
      !existing ||
      SEVERITY_ORDER[signal.severity] > SEVERITY_ORDER[existing.severity] ||
      (SEVERITY_ORDER[signal.severity] === SEVERITY_ORDER[existing.severity] &&
        signal.score > existing.score)
    ) {
      dedupMap.set(key, signal)
    }
  }

  const deduped = [...dedupMap.values()].sort((a, b) => b.score - a.score)

  const critical = deduped.filter(s => s.severity === RiskSeverity.critical)
  const warning = deduped.filter(s => s.severity === RiskSeverity.warning)
  const advisory = deduped.filter(s => s.severity === RiskSeverity.advisory)

  // Compute scores
  const maintainerScore = average(maintainerSignals.map(s => s.score))
  const abandonmentScore = average(abandonmentSignals.map(s => s.score))
  const licenseScore = licenseSignals.length > 0 ? Math.max(...licenseSignals.map(s => s.score)) : 0
  const consolidationScore = Math.min(consolidations.length * 5, 50)

  const overall =
    maintainerScore * 0.3 +
    abandonmentScore * 0.3 +
    licenseScore * 0.3 +
    consolidationScore * 0.1

  const score: RiskScore = {
    overall: Math.round(overall * 10) / 10,
    maintainer: Math.round(maintainerScore * 10) / 10,
    abandonment: Math.round(abandonmentScore * 10) / 10,
    license: Math.round(licenseScore * 10) / 10,
    consolidation: consolidationScore,
  }

  // Top actions: first 3 critical messages + first 2 warning messages, deduplicated
  const topActionMessages: string[] = []
  const seenMessages = new Set<string>()
  for (const signal of [...critical.slice(0, 3), ...warning.slice(0, 2)]) {
    if (!seenMessages.has(signal.message)) {
      seenMessages.add(signal.message)
      topActionMessages.push(signal.message)
    }
  }

  return {
    critical,
    warning,
    advisory,
    score,
    topActions: topActionMessages,
    generatedAt: new Date(),
  }
}
