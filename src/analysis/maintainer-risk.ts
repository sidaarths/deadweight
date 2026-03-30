import type { DependencyTree, DependencyNode, RiskSignal } from '../types/index.js'
import type { GitHubClient } from '../registry/github.js'
import { RiskSeverity } from '../types/index.js'

const HIGH_DOWNLOAD_THRESHOLD = 100_000

interface MaintainerRiskOptions {
  tree: DependencyTree
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
  gitHubClient: Pick<GitHubClient, 'getRepoHealth'> | undefined,
  signals: RiskSignal[]
): Promise<void> {
  const meta = node.registryMetadata
  if (!meta) return

  const maintainerCount = meta.maintainers.length
  if (maintainerCount !== 1) return

  const maintainerName = meta.maintainers[0]?.name ?? 'unknown'

  let severity: RiskSignal['severity'] = RiskSeverity.warning
  let score = 40

  // Direct dep with high downloads → critical
  if (node.directDependency && (meta.weeklyDownloads ?? 0) > HIGH_DOWNLOAD_THRESHOLD) {
    severity = RiskSeverity.critical
    score = 60
  }

  // Check GitHub for contributor count / archived status
  let archivedNote = ''
  if (gitHubClient && meta.repositoryUrl) {
    const health = await gitHubClient.getRepoHealth(meta.repositoryUrl)
    if (health) {
      if (health.contributorCount === 1) {
        severity = RiskSeverity.critical
        score = 60
      }
      if (health.isArchived) {
        archivedNote = ' (repository is archived)'
        severity = RiskSeverity.critical
        score = 60
      }
    }
  }

  signals.push({
    type: 'single_maintainer',
    severity,
    package: nodeToPackage(node),
    message: `${node.name} has a single maintainer (${maintainerName})${archivedNote}`,
    score,
    actionable: true,
    remediation: 'Monitor maintainer activity; consider alternatives',
  })
}

async function walkTree(
  node: DependencyNode,
  gitHubClient: Pick<GitHubClient, 'getRepoHealth'> | undefined,
  signals: RiskSignal[]
): Promise<void> {
  await analyzeNode(node, gitHubClient, signals)
  for (const child of node.dependencies) {
    await walkTree(child, gitHubClient, signals)
  }
}

export async function analyzeMaintainerRisk(options: MaintainerRiskOptions): Promise<RiskSignal[]> {
  const { tree, gitHubClient } = options
  const signals: RiskSignal[] = []
  // Walk direct children of root (skip root itself)
  for (const child of tree.root.dependencies) {
    await walkTree(child, gitHubClient, signals)
  }
  return signals
}
