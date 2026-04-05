import { loadConfig } from './config.js'
import { createCache } from './registry/cache.js'
import { createHttpClient } from './registry/http.js'
import { NpmRegistryClient } from './registry/npm.js'
import { GitHubClient } from './registry/github.js'
import { OsvClient } from './registry/osv.js'
import { createTreeResolver } from './analysis/tree-resolver.js'
import { createServer, registerTool, startServer } from './server.js'
import { createAnalyzeDependencyTreeTool } from './tools/analyze-dependency-tree.js'
import { createFindSingleMaintainerTool } from './tools/find-single-maintainer.js'
import { createFlagAbandonedTool } from './tools/flag-abandoned.js'
import { createGetLicenseConflictsTool } from './tools/get-license-conflicts.js'
import { createSuggestConsolidationsTool } from './tools/suggest-consolidations.js'
import { createGetHealthReportTool } from './tools/get-health-report.js'
import { createCompareAlternativeTool } from './tools/compare-alternative.js'
import { createGetEcosystemSummaryTool } from './tools/get-ecosystem-summary.js'

async function main() {
  const config = loadConfig()
  const cache = await createCache({
    dir: config.cacheDir,
    ttlSeconds: config.cacheTtlSeconds,
  })
  const http = createHttpClient({
    cache,
    rateLimitPerSecond: config.rateLimitPerSecond,
  })

  const npmClient = new NpmRegistryClient(http)
  const gitHubClient = new GitHubClient({ token: config.githubToken })
  const osvClient = new OsvClient()

  // Adapter: alternative-finder expects getMetadata(name) → RegistryMetadata | null
  const npmMetadataClient = {
    getMetadata: (name: string) =>
      npmClient.getPackageMetadata(name).catch(() => null),
  }

  const resolver = createTreeResolver({ registryClients: [npmClient] })
  const server = createServer()

  registerTool(server, createAnalyzeDependencyTreeTool(resolver))
  registerTool(server, createFindSingleMaintainerTool(resolver, { gitHubClient }))
  registerTool(server, createFlagAbandonedTool(resolver, { osvClient, gitHubClient }))
  registerTool(server, createGetLicenseConflictsTool(resolver))
  registerTool(server, createSuggestConsolidationsTool(resolver))
  registerTool(server, createGetHealthReportTool(resolver, { gitHubClient, osvClient }))
  registerTool(server, createCompareAlternativeTool(npmMetadataClient))
  registerTool(server, createGetEcosystemSummaryTool(resolver, { gitHubClient, osvClient }))

  await startServer(server)
}

main().catch(err => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
