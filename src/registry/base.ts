import type { Ecosystem, RegistryMetadata, Maintainer } from '../types/index.js'

export interface RegistryClient {
  readonly ecosystem: Ecosystem
  getPackageMetadata(name: string, version?: string): Promise<RegistryMetadata>
  getPackageMaintainers(name: string): Promise<readonly Maintainer[]>
  getDownloadCount(name: string, period?: 'last-week' | 'last-month'): Promise<number | null>
}
