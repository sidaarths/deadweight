import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import type { GitHubClient } from '../registry/github.js'
import type { OsvClient } from '../registry/osv.js'
import { GetEcosystemSummarySchema } from '../types/index.js'
import type { GetEcosystemSummaryInput } from '../types/index.js'
import { analyzeMaintainerRisk } from '../analysis/maintainer-risk.js'
import { analyzeAbandonment } from '../analysis/abandonment.js'
import { checkLicenses } from '../analysis/license-checker.js'
import { analyzeConsolidations } from '../analysis/consolidation.js'
import { buildHealthReport } from '../analysis/health-report.js'
import { readManifestInput } from '../utils/manifest.js'

interface Deps {
  gitHubClient?: Pick<GitHubClient, 'getRepoHealth'>
  osvClient?: Pick<OsvClient, 'getVulnerabilities'>
}

export function createGetEcosystemSummaryTool(
  resolver: TreeResolver,
  deps: Deps = {},
): ToolDefinition<GetEcosystemSummaryInput> {
  return {
    name: 'get_ecosystem_summary',
    description:
      'High-level dashboard for a dependency tree: total package counts, risk score distribution, and the top 3 immediate actions to reduce risk.',
    inputSchema: GetEcosystemSummarySchema,
    async handler(input: GetEcosystemSummaryInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({ content, filePath })

      const [maintainerSignals, abandonmentSignals] = await Promise.all([
        analyzeMaintainerRisk({ tree, gitHubClient: deps.gitHubClient }),
        analyzeAbandonment({ tree, osvClient: deps.osvClient, gitHubClient: deps.gitHubClient }),
      ])
      const licenseConflicts = checkLicenses(tree, null)
      const consolidations = analyzeConsolidations(tree)

      const report = buildHealthReport({
        maintainerSignals,
        abandonmentSignals,
        licenseConflicts,
        consolidations,
        tree,
      })

      return {
        ecosystem: tree.ecosystem,
        totalDirect: tree.totalDirect,
        totalTransitive: tree.totalTransitive,
        riskScore: report.score.overall,
        criticalCount: report.critical.length,
        warningCount: report.warning.length,
        advisoryCount: report.advisory.length,
        topActions: report.topActions.slice(0, 3),
      }
    },
  }
}
