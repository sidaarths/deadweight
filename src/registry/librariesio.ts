import { z } from 'zod'
import type { HttpClient } from './http.js'

interface LibrariesIoData {
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
  constructor(private readonly http: HttpClient) {}

  async getPackageData(
    name: string,
    ecosystem: string,
    apiKey: string | null
  ): Promise<LibrariesIoData> {
    if (!apiKey) return { sourceRank: null, dependentCount: null }

    const rawPlatform = PLATFORM_MAP[ecosystem] ?? ecosystem
    const platform = encodeURIComponent(rawPlatform)
    const encodedName = encodeURIComponent(name)
    const url = `https://libraries.io/api/${platform}/${encodedName}`

    try {
      const data = await this.http.fetchJson(url, {
        headers: { Authorization: `Token ${apiKey}` },
      })
      const parsed = LibrariesIoSchema.parse(data)
      return {
        sourceRank: parsed.rank ?? null,
        dependentCount: parsed.dependents_count ?? null,
      }
    } catch {
      return { sourceRank: null, dependentCount: null }
    }
  }
}
