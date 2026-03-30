import type { DependencyTree, DependencyNode, RiskSignal } from '../types/index.js'
import type { OsvClient } from '../registry/osv.js'
import type { GitHubClient } from '../registry/github.js'
import { RiskSeverity } from '../types/index.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_ADVISORY = 365
const DAYS_WARNING = 730
const DAYS_CRITICAL = 1460

const CVE_SCORES: Record<string, number> = {
  CRITICAL: 30,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 5,
}

interface AbandonmentOptions {
  tree: DependencyTree
  osvClient?: Pick<OsvClient, 'getVulnerabilities'>
  gitHubClient?: Pick<GitHubClient, 'getRepoHealth'>
}

function nodeToPackage(node: DependencyNode) {
  return {
    name: node.name,
    version: node.version,
    ecosystem: node.ecosystem,
    directDependency: node.directDependency,
    registryMetadata: node.registryMetadata,
  }
}

async function analyzeNode(
  node: DependencyNode,
  osvClient: Pick<OsvClient, 'getVulnerabilities'> | undefined,
  gitHubClient: Pick<GitHubClient, 'getRepoHealth'> | undefined,
  signals: RiskSignal[]
): Promise<void> {
  const meta = node.registryMetadata
  if (!meta) return

  let score = 0
  let severity: RiskSignal['severity'] | null = null
  const messageParts: string[] = []

  // Deprecated check (always critical, score 90)
  if (meta.deprecated) {
    score = 90
    severity = RiskSeverity.critical
    messageParts.push(`deprecated: ${meta.deprecated}`)
  }

  // Staleness check
  if (meta.lastPublishDate !== null && !meta.deprecated) {
    const daysAgo = (Date.now() - meta.lastPublishDate.getTime()) / MS_PER_DAY
    if (daysAgo > DAYS_CRITICAL) {
      score = Math.max(score, 70)
      severity = RiskSeverity.critical
      messageParts.push(`last published ${Math.round(daysAgo / 365)} years ago`)
    } else if (daysAgo > DAYS_WARNING) {
      score = Math.max(score, 40)
      if (severity !== RiskSeverity.critical) severity = RiskSeverity.warning
      messageParts.push(`last published ${Math.round(daysAgo / 365)} years ago`)
    } else if (daysAgo > DAYS_ADVISORY) {
      score = Math.max(score, 20)
      if (!severity) severity = RiskSeverity.advisory
      messageParts.push(`last published ${Math.round(daysAgo)} days ago`)
    }
  }

  // GitHub archived check
  if (gitHubClient && meta.repositoryUrl) {
    const health = await gitHubClient.getRepoHealth(meta.repositoryUrl)
    if (health?.isArchived) {
      score = 85
      severity = RiskSeverity.critical
      messageParts.push('repository is archived')
    }
  }

  // CVE check
  if (osvClient) {
    const vulns = await osvClient.getVulnerabilities(
      node.name,
      node.ecosystem,
      node.version
    )
    let cveScore = 0
    for (const vuln of vulns) {
      cveScore += CVE_SCORES[vuln.severity ?? ''] ?? 0
    }
    if (cveScore > 0) {
      score = Math.min(score + cveScore, 100)
      if (score >= 70 && severity !== RiskSeverity.critical) severity = RiskSeverity.critical
      else if (score >= 40 && !severity) severity = RiskSeverity.warning
      else if (!severity) severity = RiskSeverity.advisory
    }
  }

  if (severity === null) return

  signals.push({
    type: 'abandoned',
    severity,
    package: nodeToPackage(node),
    message: `${node.name}: ${messageParts.join('; ')}`,
    score,
    actionable: true,
    remediation: 'Consider replacing with an actively maintained alternative',
  })
}

async function walkTree(
  node: DependencyNode,
  osvClient: Pick<OsvClient, 'getVulnerabilities'> | undefined,
  gitHubClient: Pick<GitHubClient, 'getRepoHealth'> | undefined,
  signals: RiskSignal[]
): Promise<void> {
  await analyzeNode(node, osvClient, gitHubClient, signals)
  for (const child of node.dependencies) {
    await walkTree(child, osvClient, gitHubClient, signals)
  }
}

export async function analyzeAbandonment(options: AbandonmentOptions): Promise<RiskSignal[]> {
  const { tree, osvClient, gitHubClient } = options
  const signals: RiskSignal[] = []
  for (const child of tree.root.dependencies) {
    await walkTree(child, osvClient, gitHubClient, signals)
  }
  return signals
}
