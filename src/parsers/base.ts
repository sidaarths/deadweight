import type { Ecosystem } from '../types/index.js'

export interface ParsedManifest {
  /** All direct runtime dependencies: name → version range */
  dependencies: Map<string, string>
  /** Direct dev dependencies: name → version range */
  devDependencies: Map<string, string>
  ecosystem: Ecosystem
  /** Lockfile-resolved packages if a lockfile was parsed: name@version → resolved version */
  resolvedVersions: Map<string, string>
  /** Warning messages (e.g. no lockfile found) */
  warnings: string[]
  /** Root package name (from lockfile root entry or package.json) */
  rootName?: string
  /** Root package version */
  rootVersion?: string
}

export interface ManifestParser {
  parse(content: string, filePath?: string): Promise<ParsedManifest>
}
