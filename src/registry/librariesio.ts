import { z } from 'zod'
import { validateUrl } from './http.js'

export interface LibrariesIoData {
  sourceRank: number | null
  dependentCount: number | null
}

const PLATFORM_MAP: Record<string, string> = {
  nodejs: 'npm',
  python: 'pypi',
  rust: 'cargo',
  golang: 'go',
  dotnet: 'nuget',
  java: 'maven',
}

const LibrariesIoSchema = z.object({
  rank: z.number().nullable().optional(),
  dependents_count: z.number().nullable().optional(),
})

export class LibrariesIoClient {
  async getPackageData(
    name: string,
    ecosystem: string,
    apiKey: string | null
  ): Promise<LibrariesIoData> {
    if (!apiKey) return { sourceRank: null, dependentCount: null }

    const rawPlatform = PLATFORM_MAP[ecosystem] ?? ecosystem
    const platform = encodeURIComponent(rawPlatform)
    const encodedName = encodeURIComponent(name)
    // api_key in query string is required by libraries.io; ensure it never appears in error messages
    const baseUrl = `https://libraries.io/api/${platform}/${encodedName}`
    const url = `${baseUrl}?api_key=${apiKey}`

    try {
      validateUrl(baseUrl)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      let response: Response
      try {
        response = await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) return { sourceRank: null, dependentCount: null }

      const data = LibrariesIoSchema.parse(await response.json())
      return {
        sourceRank: data.rank ?? null,
        dependentCount: data.dependents_count ?? null,
      }
    } catch {
      return { sourceRank: null, dependentCount: null }
    }
  }
}
