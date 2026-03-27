import { z } from 'zod'
import { basename } from 'node:path'
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
  async parse(content: string, filePath?: string): Promise<ParsedManifest> {
    const fileName = filePath ? basename(filePath) : ''

    // bun.lockb is a binary format — cannot be parsed as text
    if (fileName === 'bun.lockb') {
      throw new Error(
        'bun.lockb is a binary lockfile and cannot be parsed — point the tool at package.json in the same directory instead',
      )
    }

    // bun.lock uses JSON5 (trailing commas) — strip them before parsing
    if (fileName === 'bun.lock') {
      return this.parseBunLock(content)
    }

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

  private parseBunLock(content: string): ParsedManifest {
    // bun.lock is JSON5: strip trailing commas before the standard JSON.parse
    const normalized = content.replace(/,(\s*[}\]])/g, '$1')
    let raw: unknown
    try {
      raw = JSON.parse(normalized)
    } catch {
      throw new Error('bun.lock: failed to parse — unexpected format')
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new Error('bun.lock: unexpected top-level type')
    }
    const obj = raw as Record<string, unknown>

    const dependencies = new Map<string, string>()
    const devDependencies = new Map<string, string>()
    const resolvedVersions = new Map<string, string>()
    let rootName: string | undefined
    let rootVersion: string | undefined

    // workspaces[""] is the root workspace
    const workspaces = obj['workspaces'] as Record<string, unknown> | undefined
    if (workspaces && typeof workspaces[''] === 'object' && workspaces[''] !== null) {
      const root = workspaces[''] as Record<string, unknown>
      rootName = typeof root['name'] === 'string' ? root['name'] : undefined
      rootVersion = typeof root['version'] === 'string' ? root['version'] : undefined
      for (const [name, range] of Object.entries((root['dependencies'] ?? {}) as Record<string, string>)) {
        dependencies.set(name, range)
      }
      for (const [name, range] of Object.entries((root['devDependencies'] ?? {}) as Record<string, string>)) {
        devDependencies.set(name, range)
      }
    }

    // packages: { "name": [resolution, deps, meta, checksum] }
    // The key is the package name; the resolution string at index 0 is "name@version".
    // Extract the version from the resolution string using the last @ separator.
    const packages = obj['packages'] as Record<string, unknown> | undefined
    if (packages) {
      for (const [name, entry] of Object.entries(packages)) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
        const resolution = entry[0] as string // e.g. "@esbuild/aix-ppc64@0.21.5"
        const lastAt = resolution.lastIndexOf('@')
        if (lastAt > 0) {
          const version = resolution.slice(lastAt + 1)
          if (version) resolvedVersions.set(name, version)
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
