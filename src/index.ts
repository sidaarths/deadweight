import { loadConfig } from './config.js'
import { createCache } from './registry/cache.js'
import { createHttpClient } from './registry/http.js'
import { NpmRegistryClient } from './registry/npm.js'
import { createTreeResolver } from './analysis/tree-resolver.js'
import { createServer, registerTool, startServer } from './server.js'
import { createAnalyzeDependencyTreeTool } from './tools/analyze-dependency-tree.js'

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
  const resolver = createTreeResolver({ registryClients: [npmClient] })
  const server = createServer()

  registerTool(server, createAnalyzeDependencyTreeTool(resolver))

  await startServer(server)
}

main().catch(err => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
