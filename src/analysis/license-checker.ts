import type { DependencyTree, DependencyNode } from '../types/index.js'
import type { LicenseConflict } from '../types/index.js'
import { normalizeSpdx, isStrongCopyleft, isNonCommercial, PROPRIETARY_PROJECT_LICENSES } from './spdx-compat.js'

function nodeToPackage(node: DependencyNode) {
  return {
    name: node.name,
    version: node.version,
    ecosystem: node.ecosystem,
    directDependency: node.directDependency,
    registryMetadata: node.registryMetadata,
  }
}

function walkTree(
  node: DependencyNode,
  projectLicense: string | null,
  gpl2Packages: DependencyNode[],
  gpl3Packages: DependencyNode[],
  conflicts: LicenseConflict[],
  path: string[]
): void {
  for (const child of node.dependencies) {
    const childPath = [...path, child.name]
    const rawLicense = child.registryMetadata?.license ?? null
    const spdx = normalizeSpdx(rawLicense)

    if (rawLicense !== null) {
      if (spdx === null) {
        // Unrecognized license string
        conflicts.push({
          type: 'unknown_license',
          severity: 'advisory',
          packageA: nodeToPackage(child),
          packageB: null,
          description: `Package "${child.name}" has an unrecognized license: "${rawLicense}"`,
          path: childPath,
        })
      } else {
        // GPL-2.0 / GPL-3.0 incompatibility tracking
        if (spdx === 'GPL-2.0' || spdx.startsWith('GPL-2.0-')) gpl2Packages.push(child)
        if (spdx === 'GPL-3.0' || spdx.startsWith('GPL-3.0-')) gpl3Packages.push(child)

        // Strong copyleft in proprietary project
        if (
          projectLicense !== null &&
          PROPRIETARY_PROJECT_LICENSES.has(projectLicense) &&
          isStrongCopyleft(spdx) &&
          !(spdx === 'AGPL-3.0' || spdx.startsWith('AGPL-3.0-'))
        ) {
          conflicts.push({
            type: 'copyleft_in_proprietary',
            severity: 'critical',
            packageA: nodeToPackage(child),
            packageB: null,
            description: `Package "${child.name}" uses ${spdx} which is incompatible with the project's ${projectLicense} license`,
            path: childPath,
            legalRisk: 'Copyleft license requires derivative works to be released under the same license',
          })
        }

        // AGPL network use warning
        if (spdx === 'AGPL-3.0' || spdx.startsWith('AGPL-3.0-')) {
          conflicts.push({
            type: 'agpl_network_use',
            severity: 'warning',
            packageA: nodeToPackage(child),
            packageB: null,
            description: `Package "${child.name}" uses AGPL-3.0 which requires source disclosure for network use`,
            path: childPath,
            legalRisk: 'AGPL requires releasing source code when the software is used over a network',
          })
        }

        // Non-commercial restriction
        if (isNonCommercial(spdx)) {
          conflicts.push({
            type: 'non_commercial_in_production',
            severity: 'critical',
            packageA: nodeToPackage(child),
            packageB: null,
            description: `Package "${child.name}" uses ${spdx} which restricts commercial use`,
            path: childPath,
            legalRisk: 'Non-commercial license prohibits use in commercial products',
          })
        }
      }
    }

    walkTree(child, projectLicense, gpl2Packages, gpl3Packages, conflicts, childPath)
  }
}

export function checkLicenses(
  tree: DependencyTree,
  projectLicense: string | null
): LicenseConflict[] {
  const conflicts: LicenseConflict[] = []
  const gpl2Packages: DependencyNode[] = []
  const gpl3Packages: DependencyNode[] = []

  walkTree(tree.root, projectLicense, gpl2Packages, gpl3Packages, conflicts, [])

  // GPL-2.0 + GPL-3.0 incompatibility
  if (gpl2Packages.length > 0 && gpl3Packages.length > 0) {
    for (const gpl2pkg of gpl2Packages) {
      for (const gpl3pkg of gpl3Packages) {
        conflicts.push({
          type: 'gpl2_gpl3_incompatibility',
          severity: 'critical',
          packageA: nodeToPackage(gpl2pkg),
          packageB: nodeToPackage(gpl3pkg),
          description: `GPL-2.0 (${gpl2pkg.name}) and GPL-3.0 (${gpl3pkg.name}) are incompatible due to the GPL-2.0-only clause`,
          path: [gpl2pkg.name, gpl3pkg.name],
          legalRisk: 'GPL-2.0-only code cannot be combined with GPL-3.0 code',
        })
      }
    }
  }

  return conflicts
}
