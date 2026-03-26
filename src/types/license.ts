import type { Package } from './package.js'

export interface LicenseInfo {
  raw: string | null
  spdx: string | null           // Normalized SPDX identifier, null if unrecognized
  isOsiApproved: boolean
  isCopyleft: boolean
  isCommerciallyRestrictive: boolean
  url?: string
}

export type LicenseConflictType =
  | 'copyleft_in_proprietary'
  | 'gpl2_gpl3_incompatibility'
  | 'non_commercial_in_production'
  | 'agpl_network_use'
  | 'unknown_license'
  | 'license_expression_conflict'

export interface LicenseConflict {
  type: LicenseConflictType
  severity: 'critical' | 'warning' | 'advisory'
  packageA: Package
  packageB: Package | null          // null when conflict is package vs project
  description: string
  path: string[]                    // Dependency path from root to offending package
  legalRisk?: string
}
