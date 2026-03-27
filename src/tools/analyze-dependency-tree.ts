import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import { AnalyzeDependencyTreeSchema } from '../types/index.js'
import type { AnalyzeDependencyTreeInput, DependencyNode } from '../types/index.js'
import { readFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path' // resolve used in assertAllowedManifestPath

const MAX_SERIALIZE_DEPTH = 50

// Allowlist of manifest filenames the tool is permitted to read.
// Prevents reading arbitrary files (SSH keys, .env, etc.) even if the caller
// supplies an absolute path, while still allowing paths anywhere on the machine.
const ALLOWED_MANIFEST_NAMES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock',
  'go.mod', 'go.sum',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'packages.config', 'Directory.Packages.props',
])

function assertAllowedManifestPath(rawPath: string): string {
  // Reject paths that traverse upward via '..'
  if (rawPath.includes('..')) {
    throw new Error('Path must not contain directory traversal sequences')
  }
  const resolved = resolve(rawPath)
  const name = basename(resolved)
  // Allow .csproj files (variable prefix, fixed extension)
  const isCsproj = name.endsWith('.csproj')
  if (!ALLOWED_MANIFEST_NAMES.has(name) && !isCsproj) {
    throw new Error(
      `Path must point to a known manifest file (e.g. package.json, requirements.txt). Got: ${name}`,
    )
  }
  return resolved
}

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
        const resolvedPath = assertAllowedManifestPath(input.path)
        content = await readFile(resolvedPath, 'utf-8')
        filePath = resolvedPath
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
