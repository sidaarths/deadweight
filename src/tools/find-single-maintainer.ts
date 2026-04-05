import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import type { GitHubClient } from '../registry/github.js'
import { FindSingleMaintainerSchema } from '../types/index.js'
import type { FindSingleMaintainerInput } from '../types/index.js'
import { analyzeMaintainerRisk } from '../analysis/maintainer-risk.js'
import { readManifestInput } from '../utils/manifest.js'

interface Deps {
  gitHubClient?: Pick<GitHubClient, 'getRepoHealth'>
}

export function createFindSingleMaintainerTool(
  resolver: TreeResolver,
  deps: Deps = {},
): ToolDefinition<FindSingleMaintainerInput> {
  return {
    name: 'find_single_maintainer_dependencies',
    description:
      'Find dependencies that have only a single maintainer. Single-maintainer packages are a bus-factor risk — if the maintainer becomes unavailable the package may go unmaintained.',
    inputSchema: FindSingleMaintainerSchema,
    async handler(input: FindSingleMaintainerInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({ content, filePath })
      const signals = await analyzeMaintainerRisk({ tree, gitHubClient: deps.gitHubClient })

      return {
        ecosystem: tree.ecosystem,
        manifestPath: tree.manifestPath,
        signals,
        total: signals.length,
      }
    },
  }
}
