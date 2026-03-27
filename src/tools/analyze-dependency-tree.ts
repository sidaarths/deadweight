import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import { AnalyzeDependencyTreeSchema } from '../types/index.js'
import type { AnalyzeDependencyTreeInput, DependencyNode } from '../types/index.js'
import { readFile } from 'node:fs/promises'

const MAX_SERIALIZE_DEPTH = 50

export function createAnalyzeDependencyTreeTool(
  resolver: TreeResolver,
): ToolDefinition<AnalyzeDependencyTreeInput> {
  return {
    name: 'analyze_dependency_tree' as const,
    description:
      'Resolve the full transitive dependency tree from a manifest file. Returns a structured package graph with metadata for every node. Call this first before using other tools.',
    inputSchema: AnalyzeDependencyTreeSchema,
    async handler(input: AnalyzeDependencyTreeInput) {
      let content: string
      let filePath: string | undefined

      if (input.path) {
        content = await readFile(input.path, 'utf-8')
        filePath = input.path
      } else {
        content = input.content!
      }

      const tree = await resolver.resolve({
        content,
        filePath,
        includeDevDependencies: input.includeDevDependencies,
      })

      return {
        ecosystem: tree.ecosystem,
        manifestPath: tree.manifestPath,
        totalDirect: tree.totalDirect,
        totalTransitive: tree.totalTransitive,
        resolvedAt: tree.resolvedAt.toISOString(),
        warnings: tree.warnings,
        root: serializeNode(tree.root, 0),
      }
    },
  }
}

function serializeNode(node: DependencyNode, currentDepth: number): unknown {
  return {
    name: node.name,
    version: node.version,
    ecosystem: node.ecosystem,
    directDependency: node.directDependency,
    depth: node.depth,
    isDuplicate: node.isDuplicate,
    registryMetadata: node.registryMetadata
      ? {
          maintainers: node.registryMetadata.maintainers,
          lastPublishDate:
            node.registryMetadata.lastPublishDate?.toISOString() ?? null,
          weeklyDownloads: node.registryMetadata.weeklyDownloads,
          license: node.registryMetadata.license,
          repositoryUrl: node.registryMetadata.repositoryUrl,
          description: node.registryMetadata.description,
        }
      : null,
    dependencies:
      currentDepth < MAX_SERIALIZE_DEPTH
        ? node.dependencies.map(d => serializeNode(d, currentDepth + 1))
        : [],
  }
}
