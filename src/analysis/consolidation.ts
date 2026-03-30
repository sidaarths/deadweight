import type { DependencyTree, DependencyNode, Package } from '../types/index.js'
import type { Consolidation } from '../types/index.js'
import { getCategory } from './categories.js'

const SKIP_CATEGORIES = new Set(['other', 'testing'])

function nodeToPackage(node: DependencyNode): Package {
  return {
    name: node.name,
    version: node.version,
    ecosystem: node.ecosystem,
    directDependency: node.directDependency,
    registryMetadata: node.registryMetadata,
  }
}

function collectAllNodes(node: DependencyNode, seen: Set<string>, nodes: DependencyNode[]): void {
  if (seen.has(node.name)) return
  seen.add(node.name)
  nodes.push(node)
  for (const child of node.dependencies) {
    collectAllNodes(child, seen, nodes)
  }
}

export function analyzeConsolidations(tree: DependencyTree): Consolidation[] {
  // Collect all unique nodes (excluding root)
  const allNodes: DependencyNode[] = []
  const seen = new Set<string>()
  for (const child of tree.root.dependencies) {
    collectAllNodes(child, seen, allNodes)
  }

  // Group by category
  const categoryGroups = new Map<string, DependencyNode[]>()
  for (const node of allNodes) {
    const category = getCategory(node.name)
    if (SKIP_CATEGORIES.has(category)) continue
    const group = categoryGroups.get(category) ?? []
    group.push(node)
    categoryGroups.set(category, group)
  }

  const consolidations: Consolidation[] = []

  for (const [category, nodes] of categoryGroups) {
    if (nodes.length < 2) continue

    // Find recommendation: package with highest weekly downloads
    let bestNode = nodes[0]
    for (const node of nodes) {
      const bestDownloads = bestNode.registryMetadata?.weeklyDownloads ?? 0
      const nodeDownloads = node.registryMetadata?.weeklyDownloads ?? 0
      if (nodeDownloads > bestDownloads) bestNode = node
    }

    const packages = nodes.map(nodeToPackage)
    const names = nodes.map(n => n.name).join(', ')

    consolidations.push({
      category,
      packages,
      recommendation: bestNode.name,
      reason: `Multiple packages solving the same problem: ${names}`,
      estimatedSizeSavingsBytes: null,
    })
  }

  return consolidations
}
