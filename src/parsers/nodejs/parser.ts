import { z } from 'zod'
import type { ManifestParser, ParsedManifest } from '../base.js'
import { Ecosystem } from '../../types/index.js'

// package.json schema (minimal — only what we need)
// Note: Zod v4 requires z.record(keySchema, valueSchema)
const PackageJsonSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional().default({}),
  devDependencies: z.record(z.string(), z.string()).optional().default({}),
})

// Individual package entry in lockfile packages map (non-root entries have "version")
const LockfilePackageSchema = z.object({
  version: z.string(),
  dev: z.boolean().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
})

// Root entry in lockfile packages[""] — like package.json shape (no "version" required)
const LockfileRootEntrySchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

// lockfile v2/v3 schema — discriminated by lockfileVersion
const LockfileSchema = z.object({
  lockfileVersion: z.number(),
  packages: z.record(z.string(), z.unknown()).optional(),
  // v1 format top-level dependencies key
  dependencies: z.record(z.string(), z.unknown()).optional(),
})

export class NodejsParser implements ManifestParser {
  async parse(content: string, _filePath?: string): Promise<ParsedManifest> {
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch {
      throw new Error('NodejsParser: content is not valid JSON')
    }

    // Try lockfile first (discriminated by lockfileVersion field)
    const lockfileResult = LockfileSchema.safeParse(raw)
    if (lockfileResult.success) {
      return this.parseLockfile(raw as Record<string, unknown>)
    }

    // Try package.json — must have at least name, version, dependencies, or devDependencies
    const pkgResult = PackageJsonSchema.safeParse(raw)
    if (pkgResult.success) {
      const obj = raw as Record<string, unknown>
      const hasKnownKeys =
        'name' in obj ||
        'version' in obj ||
        'dependencies' in obj ||
        'devDependencies' in obj
      if (hasKnownKeys) {
        return this.parsePackageJson(pkgResult.data)
      }
    }

    throw new Error('NodejsParser: content is neither a package.json nor a package-lock.json')
  }

  private parsePackageJson(pkg: z.infer<typeof PackageJsonSchema>): ParsedManifest {
    return {
      ecosystem: Ecosystem.nodejs,
      dependencies: new Map(Object.entries(pkg.dependencies ?? {})),
      devDependencies: new Map(Object.entries(pkg.devDependencies ?? {})),
      resolvedVersions: new Map(),
      warnings: ['No lockfile provided — transitive dependencies cannot be resolved accurately'],
      rootName: pkg.name,
      rootVersion: pkg.version,
    }
  }

  private parseLockfile(raw: Record<string, unknown>): ParsedManifest {
    const resolvedVersions = new Map<string, string>()
    const dependencies = new Map<string, string>()
    const devDependencies = new Map<string, string>()
    let rootName: string | undefined
    let rootVersion: string | undefined

    const rawPackages = raw['packages'] as Record<string, unknown> | undefined

    if (rawPackages) {
      // Parse the root entry (key "") first to extract direct deps
      const rawRoot = rawPackages['']
      if (rawRoot) {
        const rootResult = LockfileRootEntrySchema.safeParse(rawRoot)
        if (rootResult.success) {
          rootName = rootResult.data.name
          rootVersion = rootResult.data.version
          for (const [name, range] of Object.entries(rootResult.data.dependencies ?? {})) {
            dependencies.set(name, range)
          }
          for (const [name, range] of Object.entries(rootResult.data.devDependencies ?? {})) {
            devDependencies.set(name, range)
          }
        }
      }

      // Parse non-root entries to build resolvedVersions
      for (const [path, rawPkg] of Object.entries(rawPackages)) {
        if (path === '') continue // already handled above

        const pkgResult = LockfilePackageSchema.safeParse(rawPkg)
        if (pkgResult.success) {
          // Strip "node_modules/" prefix to get the package name.
          // Handles scoped packages: "node_modules/@scope/name" → "@scope/name"
          const name = path.replace(/^node_modules\//, '')
          resolvedVersions.set(name, pkgResult.data.version)
        }
      }
    }

    return {
      ecosystem: Ecosystem.nodejs,
      dependencies,
      devDependencies,
      resolvedVersions,
      warnings: [],
      rootName,
      rootVersion,
    }
  }
}
