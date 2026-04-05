import type { ToolDefinition } from '../server.js'
import type { RegistryMetadata } from '../types/index.js'
import { CompareAlternativeSchema } from '../types/index.js'
import type { CompareAlternativeInput } from '../types/index.js'
import { findAlternatives } from '../analysis/alternative-finder.js'

interface MetadataClient {
  getMetadata(name: string): Promise<RegistryMetadata | null>
}

export function createCompareAlternativeTool(
  npmClient?: MetadataClient,
): ToolDefinition<CompareAlternativeInput> {
  return {
    name: 'compare_alternative',
    description:
      'Score alternatives to a package by weekly downloads, maintainer count, recency, and compatibility. Returns up to 5 ranked alternatives. No manifest file needed.',
    inputSchema: CompareAlternativeSchema,
    async handler(input: CompareAlternativeInput) {
      const alternatives = await findAlternatives({
        packageName: input.packageName,
        ecosystem: input.ecosystem,
        npmClient,
      })

      return {
        packageName: input.packageName,
        ecosystem: input.ecosystem,
        alternatives,
      }
    },
  }
}
