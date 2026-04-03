import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import { GetLicenseConflictsSchema } from '../types/index.js'
import type { GetLicenseConflictsInput } from '../types/index.js'
import { checkLicenses } from '../analysis/license-checker.js'
import { readManifestInput } from '../utils/manifest.js'

export function createGetLicenseConflictsTool(
  resolver: TreeResolver,
): ToolDefinition<GetLicenseConflictsInput> {
  return {
    name: 'get_transitive_license_conflicts',
    description:
      'Walk the full transitive dependency tree and detect license incompatibilities. Flags GPL/AGPL copyleft packages in proprietary projects, non-commercial restrictions, and GPL-2.0/GPL-3.0 mixing.',
    inputSchema: GetLicenseConflictsSchema,
    async handler(input: GetLicenseConflictsInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({ content, filePath })
      const conflicts = checkLicenses(tree, input.projectLicense ?? null)

      return {
        ecosystem: tree.ecosystem,
        manifestPath: tree.manifestPath,
        projectLicense: input.projectLicense ?? null,
        conflicts,
        total: conflicts.length,
      }
    },
  }
}
