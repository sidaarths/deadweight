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

/**
 * Encode a package name for use in the npm registry URL.
 * Scoped packages (@scope/name) require the form `@scope%2Fname` —
 * the `@` must be literal and only the `/` is percent-encoded.
 * `encodeURIComponent` would incorrectly encode both characters.
 */
function npmRegistryPath(name: string): string {
  if (name.startsWith('@')) {
    const slash = name.indexOf('/')
    if (slash !== -1) {
      const scope = name.slice(1, slash)
      const pkg = name.slice(slash + 1)
      return `@${encodeURIComponent(scope)}%2F${encodeURIComponent(pkg)}`
    }
  }
  return encodeURIComponent(name)
}

function isHttpsUrl(url: string | null): url is string {
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export class NpmRegistryClient implements RegistryClient {
  readonly ecosystem = Ecosystem.nodejs

  constructor(private readonly http: HttpClient) {}

  async getPackageMetadata(name: string, _version?: string): Promise<RegistryMetadata> {
    const raw = await this.http.fetchJson(
      `https://registry.npmjs.org/${npmRegistryPath(name)}`
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

    const rawRepoUrl = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null
    const repositoryUrl = isHttpsUrl(rawRepoUrl) ? rawRepoUrl : null

    return {
      maintainers,
      lastPublishDate,
      weeklyDownloads: null, // fetched separately via getDownloadCount
      license: pkg.license ?? null,
      repositoryUrl,
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
        `https://api.npmjs.org/downloads/point/last-week/${npmRegistryPath(name)}`
      )
      const data = NpmDownloadsSchema.parse(raw)
      return data.downloads
    } catch {
      return null
    }
  }
}
