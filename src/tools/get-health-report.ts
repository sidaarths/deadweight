import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import type { GitHubClient } from '../registry/github.js'
import type { OsvClient } from '../registry/osv.js'
import { GetHealthReportSchema } from '../types/index.js'
import type { GetHealthReportInput } from '../types/index.js'
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

export function createGetHealthReportTool(
  resolver: TreeResolver,
  deps: Deps = {},
): ToolDefinition<GetHealthReportInput> {
  return {
    name: 'get_dependency_health_report',
    description:
      'Synthesize all risk signals (maintainer, abandonment, license, consolidation) into a prioritized health report. Returns critical/warning/advisory groups, a 0-100 risk score, and top actions to reduce risk.',
    inputSchema: GetHealthReportSchema,
    async handler(input: GetHealthReportInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({
        content,
        filePath,
        includeDevDependencies: input.includeDevDependencies,
      })

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
        manifestPath: tree.manifestPath,
        critical: report.critical,
        warning: report.warning,
        advisory: report.advisory,
        score: report.score,
        topActions: report.topActions,
        generatedAt: report.generatedAt.toISOString(),
      }
    },
  }
}
