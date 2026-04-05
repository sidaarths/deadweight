import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import type { GitHubClient } from '../registry/github.js'
import type { OsvClient } from '../registry/osv.js'
import { FlagAbandonedSchema } from '../types/index.js'
import type { FlagAbandonedInput } from '../types/index.js'
import { analyzeAbandonment } from '../analysis/abandonment.js'
import { readManifestInput } from '../utils/manifest.js'

interface Deps {
  osvClient?: Pick<OsvClient, 'getVulnerabilities'>
  gitHubClient?: Pick<GitHubClient, 'getRepoHealth'>
}

export function createFlagAbandonedTool(
  resolver: TreeResolver,
  deps: Deps = {},
): ToolDefinition<FlagAbandonedInput> {
  return {
    name: 'flag_abandoned_dependencies',
    description:
      'Detect abandoned or unmaintained dependencies via publish date, repository activity, and CVE signals. Returns packages with an abandonment risk score and severity.',
    inputSchema: FlagAbandonedSchema,
    async handler(input: FlagAbandonedInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({ content, filePath })
      const signals = await analyzeAbandonment({
        tree,
        osvClient: deps.osvClient,
        gitHubClient: deps.gitHubClient,
      })

      return {
        ecosystem: tree.ecosystem,
        manifestPath: tree.manifestPath,
        signals,
        total: signals.length,
      }
    },
  }
}
