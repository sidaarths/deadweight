import { z } from 'zod'
import { validateUrl } from './http.js'

interface GitHubRepoHealth {
  lastCommitDate: Date | null
  openIssues: number
  totalIssues: number | null
  contributorCount: number
  isArchived: boolean
  stars: number
}

interface GitHubClientOptions {
  token?: string
}

const RepoSchema = z.object({
  archived: z.boolean(),
  open_issues_count: z.number(),
  stargazers_count: z.number(),
})

const CommitSchema = z.array(
  z.object({
    commit: z.object({
      author: z.object({ date: z.string() }).nullable().optional(),
    }),
  })
)

const ContributorsSchema = z.array(z.object({ login: z.string() }))

function extractOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  if (!repoUrl) return null
  try {
    const cleaned = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '')
    const url = new URL(cleaned)
    if (url.hostname !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1] }
  } catch {
    return null
  }
}

function parseLinkLastPage(link: string | null): number | null {
  if (!link) return null
  const match = link.match(/[?&]page=(\d+)>;\s*rel="last"/)
  return match ? parseInt(match[1], 10) : null
}

export class GitHubClient {
  private readonly token: string | undefined

  constructor(options: GitHubClientOptions) {
    this.token = options.token
  }

  async getRepoHealth(repoUrl: string): Promise<GitHubRepoHealth | null> {
    if (!this.token) return null
    const parsed = extractOwnerRepo(repoUrl)
    if (!parsed) return null

    const { owner, repo } = parsed
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${this.token}`,
    }

    try {
      const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      // Validate all three URLs against the SSRF allowlist before fetching
      validateUrl(base)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      let repoRes: Response, commitsRes: Response, contributorsRes: Response
      try {
        ;[repoRes, commitsRes, contributorsRes] = await Promise.all([
          fetch(base, { headers, signal: controller.signal }),
          fetch(`${base}/commits?per_page=1`, { headers, signal: controller.signal }),
          fetch(`${base}/contributors?per_page=1&anon=false`, { headers, signal: controller.signal }),
        ])
      } finally {
        clearTimeout(timeout)
      }

      if (!repoRes.ok) return null

      const repoData = RepoSchema.parse(await repoRes.json())

      let lastCommitDate: Date | null = null
      if (commitsRes.ok) {
        const commits = CommitSchema.parse(await commitsRes.json())
        const dateStr = commits[0]?.commit?.author?.date
        if (dateStr) lastCommitDate = new Date(dateStr)
      }

      let contributorCount = 0
      if (contributorsRes.ok) {
        const linkHeader = contributorsRes.headers.get('Link')
        const lastPage = parseLinkLastPage(linkHeader)
        if (lastPage !== null) {
          contributorCount = lastPage
        } else {
          const contributors = ContributorsSchema.parse(await contributorsRes.json())
          contributorCount = contributors.length
        }
      }

      return {
        lastCommitDate,
        openIssues: repoData.open_issues_count,
        totalIssues: null,
        contributorCount,
        isArchived: repoData.archived,
        stars: repoData.stargazers_count,
      }
    } catch {
      return null
    }
  }
}
