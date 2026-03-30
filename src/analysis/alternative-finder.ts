import type { Ecosystem, RegistryMetadata, Alternative } from '../types/index.js'
import { getCategory, CATEGORY_MAP } from './categories.js'

interface MetadataClient {
  getMetadata(name: string): Promise<RegistryMetadata | null>
}

interface AlternativeFinderOptions {
  packageName: string
  ecosystem: Ecosystem
  npmClient?: MetadataClient
}

function computeScore(meta: RegistryMetadata | null): number {
  if (!meta) return 0

  const downloads = meta.weeklyDownloads ?? 0
  const maintainers = meta.maintainers.length
  const lastPublish = meta.lastPublishDate

  // downloads: up to 40 points (100k/week = 40pts)
  const downloadScore = Math.min(downloads / 100_000, 1) * 40

  // maintainers: up to 20 points (4+ maintainers = 20pts)
  const maintainerScore = Math.min(maintainers * 5, 20)

  // recency: up to 40 points (recently published = more points)
  let recencyScore = 0
  if (lastPublish) {
    const daysAgo = (Date.now() - lastPublish.getTime()) / (24 * 60 * 60 * 1000)
    recencyScore = Math.max(40 - (daysAgo / 365) * 20, 0)
  }

  return Math.min(Math.round(downloadScore + maintainerScore + recencyScore), 100)
}

export async function findAlternatives(options: AlternativeFinderOptions): Promise<Alternative[]> {
  const { packageName, ecosystem, npmClient } = options

  const category = getCategory(packageName)
  if (category === 'other') return []

  const candidates = CATEGORY_MAP[category].filter(name => name !== packageName).slice(0, 5)
  if (candidates.length === 0) return []

  const results: Alternative[] = []

  for (const candidate of candidates) {
    let meta: RegistryMetadata | null = null
    if (npmClient) {
      try {
        meta = await npmClient.getMetadata(candidate)
      } catch {
        meta = null
      }
    }

    const score = computeScore(meta)
    const lastPublishDaysAgo = meta?.lastPublishDate
      ? Math.round((Date.now() - meta.lastPublishDate.getTime()) / (24 * 60 * 60 * 1000))
      : null

    results.push({
      name: candidate,
      version: 'latest',
      ecosystem,
      weeklyDownloads: meta?.weeklyDownloads ?? null,
      maintainerCount: meta?.maintainers.length ?? 0,
      lastPublishDaysAgo,
      openIssueRatio: null,
      score,
      repositoryUrl: meta?.repositoryUrl ?? undefined,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}
