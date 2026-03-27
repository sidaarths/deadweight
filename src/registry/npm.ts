import { z } from 'zod'
import type { HttpClient } from './http.js'
import type { RegistryClient } from './base.js'
import { Ecosystem } from '../types/index.js'
import type { RegistryMetadata, Maintainer } from '../types/index.js'

// Note: Zod v4 requires z.record(keySchema, valueSchema)
const NpmMaintainerSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
})

const NpmPackageSchema = z.object({
  name: z.string(),
  description: z.string().optional().nullable(),
  license: z.string().optional().nullable(),
  homepage: z.string().optional().nullable(),
  repository: z.object({ url: z.string() }).optional().nullable(),
  maintainers: z.array(NpmMaintainerSchema).optional().default([]),
  time: z.record(z.string(), z.string()).optional().default({}),
  'dist-tags': z.object({ latest: z.string().optional() }).optional(),
  deprecated: z.string().optional().nullable(),
})

const NpmDownloadsSchema = z.object({
  downloads: z.number(),
})

export class NpmRegistryClient implements RegistryClient {
  readonly ecosystem = Ecosystem.nodejs

  constructor(private readonly http: HttpClient) {}

  async getPackageMetadata(name: string, _version?: string): Promise<RegistryMetadata> {
    const raw = await this.http.fetchJson(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`
    )
    const pkg = NpmPackageSchema.parse(raw)

    // Last publish date: find the latest version's time entry
    const latestVersion = pkg['dist-tags']?.latest
    const lastPublishDate =
      latestVersion && pkg.time[latestVersion]
        ? new Date(pkg.time[latestVersion])
        : null

    const maintainers: Maintainer[] = (pkg.maintainers ?? []).map(m => ({
      name: m.name,
      email: m.email,
      url: m.url,
    }))

    return {
      maintainers,
      lastPublishDate,
      weeklyDownloads: null, // fetched separately via getDownloadCount
      license: pkg.license ?? null,
      repositoryUrl:
        pkg.repository?.url
          ?.replace(/^git\+/, '')
          .replace(/\.git$/, '') ?? null,
      description: pkg.description ?? null,
      homepage: pkg.homepage ?? null,
      deprecated: pkg.deprecated ?? null,
    }
  }

  async getPackageMaintainers(name: string): Promise<readonly Maintainer[]> {
    const meta = await this.getPackageMetadata(name)
    return meta.maintainers
  }

  async getDownloadCount(
    name: string,
    _period: 'last-week' | 'last-month' = 'last-week',
  ): Promise<number | null> {
    try {
      const raw = await this.http.fetchJson(
        `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`
      )
      const data = NpmDownloadsSchema.parse(raw)
      return data.downloads
    } catch {
      return null
    }
  }
}
