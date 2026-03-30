import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitHubClient } from '../../../src/registry/github.js'

const mockFetch = vi.fn()

const GITHUB_REPO_RESPONSE = {
  full_name: 'owner/repo',
  archived: false,
  open_issues_count: 42,
  stargazers_count: 1000,
}

const GITHUB_COMMITS_RESPONSE = [
  { sha: 'abc123', commit: { author: { date: '2024-01-15T10:00:00Z' } } },
]

const GITHUB_CONTRIBUTORS_RESPONSE = [
  { login: 'user1', contributions: 100 },
  { login: 'user2', contributions: 50 },
]

describe('GitHubClient', () => {
  let client: GitHubClient

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('URL parsing', () => {
    it('extracts owner/repo from plain https URL', async () => {
      client = new GitHubClient({ token: 'test-token' })
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/repos/owner/repo') && url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result).not.toBeNull()
      expect(result?.stars).toBe(1000)
    })

    it('extracts owner/repo from git+https URL with .git suffix', async () => {
      client = new GitHubClient({ token: 'test-token' })
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/repos/owner/myrepo') && url.endsWith('/repos/owner/myrepo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...GITHUB_REPO_RESPONSE, full_name: 'owner/myrepo' }) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('git+https://github.com/owner/myrepo.git')
      expect(result).not.toBeNull()
    })

    it('returns null for non-GitHub URLs', async () => {
      client = new GitHubClient({ token: 'test-token' })
      const result = await client.getRepoHealth('https://gitlab.com/owner/repo')
      expect(result).toBeNull()
    })

    it('returns null for invalid URL', async () => {
      client = new GitHubClient({ token: 'test-token' })
      const result = await client.getRepoHealth('not-a-url')
      expect(result).toBeNull()
    })

    it('returns null for empty string', async () => {
      client = new GitHubClient({ token: 'test-token' })
      const result = await client.getRepoHealth('')
      expect(result).toBeNull()
    })
  })

  describe('with valid token', () => {
    beforeEach(() => {
      client = new GitHubClient({ token: 'ghp_testtoken' })
    })

    it('returns repo health with correct fields', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result).not.toBeNull()
      expect(result?.isArchived).toBe(false)
      expect(result?.openIssues).toBe(42)
      expect(result?.stars).toBe(1000)
      expect(result?.lastCommitDate).toBeInstanceOf(Date)
      expect(result?.lastCommitDate?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
      expect(result?.contributorCount).toBeGreaterThan(0)
    })

    it('returns isArchived true when repo is archived', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...GITHUB_REPO_RESPONSE, archived: true }) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result?.isArchived).toBe(true)
    })

    it('returns lastCommitDate null when commits array is empty', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result?.lastCommitDate).toBeNull()
    })

    it('sets Authorization header when token provided', async () => {
      let capturedHeaders: Record<string, string> = {}
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers: new Headers() })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      await client.getRepoHealth('https://github.com/owner/repo')
      expect(capturedHeaders['Authorization']).toBe('Bearer ghp_testtoken')
    })

    it('extracts contributorCount from contributors array length', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          const headers = new Headers()
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_CONTRIBUTORS_RESPONSE), headers })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result?.contributorCount).toBe(2)
    })

    it('extracts contributorCount from Link header last page', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/repos/owner/repo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_REPO_RESPONSE) })
        }
        if (url.includes('/commits')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(GITHUB_COMMITS_RESPONSE) })
        }
        if (url.includes('/contributors')) {
          const headers = new Headers({ Link: '<https://api.github.com/repos/owner/repo/contributors?per_page=1&page=47>; rel="last"' })
          return Promise.resolve({ ok: true, json: () => Promise.resolve([{ login: 'user1' }]), headers })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })

      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result?.contributorCount).toBe(47)
    })
  })

  describe('without token', () => {
    it('returns null immediately when no token is provided', async () => {
      client = new GitHubClient({})
      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      client = new GitHubClient({ token: 'test-token' })
    })

    it('returns null on API error (non-ok response)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })
      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result).toBeNull()
    })

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      const result = await client.getRepoHealth('https://github.com/owner/repo')
      expect(result).toBeNull()
    })

    it('never throws', async () => {
      mockFetch.mockRejectedValue(new Error('Something went wrong'))
      await expect(client.getRepoHealth('https://github.com/owner/repo')).resolves.not.toThrow()
    })
  })
})
