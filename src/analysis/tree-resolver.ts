import { detectEcosystem } from '../parsers/detect.js'
import { NodejsParser } from '../parsers/nodejs/parser.js'
import type { RegistryClient } from '../registry/base.js'
import type { DependencyTree, DependencyNode } from '../types/index.js'
import { Ecosystem } from '../types/index.js'
import type { ParsedManifest } from '../parsers/base.js'
import type { ManifestParser } from '../parsers/base.js'

export interface ResolveOptions {
  content: string
  filePath?: string
  includeDevDependencies?: boolean
}

export interface TreeResolverOptions {
  registryClients: RegistryClient[]
}

export interface TreeResolver {
  resolve(options: ResolveOptions): Promise<DependencyTree>
}

export function createTreeResolver(options: TreeResolverOptions): TreeResolver {
  const clientMap = new Map<Ecosystem, RegistryClient>()
  for (const client of options.registryClients) {
    clientMap.set(client.ecosystem, client)
  }

  const parsers = new Map<Ecosystem, ManifestParser>([
    [Ecosystem.nodejs, new NodejsParser()],
  ])

  return {
    async resolve({
      content,
      filePath,
      includeDevDependencies = false,
    }: ResolveOptions): Promise<DependencyTree> {
      const ecosystem = detectEcosystem(filePath, content)
      if (!ecosystem) {
        throw new Error(
          `Could not detect ecosystem from ${filePath ?? 'content'}`,
        )
      }

      const parser = parsers.get(ecosystem)
      if (!parser) {
        throw new Error(`No parser registered for ecosystem: ${ecosystem}`)
      }

      const manifest = await parser.parse(content, filePath)
      const client = clientMap.get(ecosystem)

      return buildTree(
        manifest,
        ecosystem,
        filePath ?? 'unknown',
        client,
        includeDevDependencies,
      )
    },
  }
}

async function buildTree(
  manifest: ParsedManifest,
  ecosystem: Ecosystem,
  manifestPath: string,
  client: RegistryClient | undefined,
  includeDevDependencies: boolean,
): Promise<DependencyTree> {
  // Collect all packages to enrich from resolvedVersions
  const allPackages = new Map<string, string>() // name → version
  for (const [name, version] of manifest.resolvedVersions) {
    allPackages.set(name, version)
  }

  // Fetch registry metadata in parallel (batches of 10 to avoid overwhelming)
  const metadataMap = new Map<
    string,
    Awaited<ReturnType<RegistryClient['getPackageMetadata']>>
  >()

  if (client) {
    const entries = [...allPackages.entries()]
    const BATCH = 10
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(([name, version]) => client.getPackageMetadata(name, version)),
      )
      for (let j = 0; j < batch.length; j++) {
        const [name] = batch[j]
        const result = results[j]
        if (result.status === 'fulfilled') {
          metadataMap.set(name, result.value)
        }
      }
    }
  }

  // Determine direct runtime deps
  const directDeps = new Set(manifest.dependencies.keys())
  const devDeps = new Set(manifest.devDependencies.keys())

  // All direct deps (runtime + optionally dev)
  const includedDirectDeps = includeDevDependencies
    ? new Set([...directDeps, ...devDeps])
    : directDeps

  // Build direct dependency nodes (depth 1)
  const directNodes: DependencyNode[] = []
  for (const name of includedDirectDeps) {
    const version =
      manifest.resolvedVersions.get(name) ??
      manifest.dependencies.get(name) ??
      manifest.devDependencies.get(name) ??
      'unknown'
    directNodes.push({
      name,
      version,
      ecosystem,
      directDependency: true,
      depth: 1,
      registryMetadata: metadataMap.get(name),
      dependencies: [],
    })
  }

  // Count transitive: all resolved packages that are NOT in direct runtime deps
  // (regardless of includeDevDependencies flag — transitive = all non-direct)
  let totalTransitive = 0
  for (const name of allPackages.keys()) {
    if (!directDeps.has(name) && !devDeps.has(name)) totalTransitive++
  }

  const rootNode: DependencyNode = {
    name: manifest.rootName ?? 'root',
    version: manifest.rootVersion ?? '0.0.0',
    ecosystem,
    directDependency: false,
    depth: 0,
    dependencies: directNodes,
  }

  return {
    root: rootNode,
    ecosystem,
    manifestPath,
    totalDirect: includedDirectDeps.size,
    totalTransitive,
    resolvedAt: new Date(),
    warnings: manifest.warnings,
  }
}
