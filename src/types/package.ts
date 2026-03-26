import type { Ecosystem } from './ecosystem.js'

export interface Maintainer {
  name: string
  email?: string
  url?: string
}

export interface RegistryMetadata {
  maintainers: readonly Maintainer[]
  lastPublishDate: Date | null
  weeklyDownloads: number | null
  license: string | null
  repositoryUrl: string | null
  description: string | null
  // These are genuinely optional — not all registries expose them
  homepage: string | null | undefined
  deprecated: string | null | undefined
}

export interface Package {
  name: string
  version: string
  ecosystem: Ecosystem
  directDependency: boolean
  registryMetadata?: RegistryMetadata
}

export interface DependencyNode extends Package {
  readonly dependencies: readonly DependencyNode[]
  depth: number
  /** true when this exact version appears elsewhere in the tree (for dedup detection) */
  isDuplicate?: boolean
}

export interface DependencyTree {
  root: DependencyNode
  ecosystem: Ecosystem
  manifestPath: string
  totalDirect: number
  totalTransitive: number
  resolvedAt: Date
  readonly warnings?: readonly string[]
}
