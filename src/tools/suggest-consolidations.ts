import type { TreeResolver } from '../analysis/tree-resolver.js'
import type { ToolDefinition } from '../server.js'
import { SuggestConsolidationsSchema } from '../types/index.js'
import type { SuggestConsolidationsInput } from '../types/index.js'
import { analyzeConsolidations } from '../analysis/consolidation.js'
import { readManifestInput } from '../utils/manifest.js'

export function createSuggestConsolidationsTool(
  resolver: TreeResolver,
): ToolDefinition<SuggestConsolidationsInput> {
  return {
    name: 'suggest_consolidations',
    description:
      'Find packages that solve the same problem (e.g. multiple HTTP clients, date libraries) and suggest consolidating to a single well-maintained option to reduce bundle size and maintenance burden.',
    inputSchema: SuggestConsolidationsSchema,
    async handler(input: SuggestConsolidationsInput) {
      const { content, filePath } = await readManifestInput(input)
      const tree = await resolver.resolve({ content, filePath })
      const consolidations = analyzeConsolidations(tree)

      return {
        ecosystem: tree.ecosystem,
        manifestPath: tree.manifestPath,
        consolidations,
        total: consolidations.length,
      }
    },
  }
}
