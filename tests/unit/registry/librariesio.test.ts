import { describe, it, expect, vi } from 'vitest'
import { LibrariesIoClient } from '../../../src/registry/librariesio.js'
import type { HttpClient } from '../../../src/registry/http.js'

const LIBRARIES_IO_RESPONSE = {
  name: 'lodash',
  platform: 'npm',
  rank: 28,
  dependents_count: 150000,
}

function makeMockHttp(
  impl?: (url: string, init?: RequestInit) => Promise<unknown>,
): { http: HttpClient; fetchJson: ReturnType<typeof vi.fn> } {
  const fetchJson = impl ? vi.fn(impl) : vi.fn()
  return { http: { fetchJson }, fetchJson }
}

describe('LibrariesIoClient', () => {
  describe('getPackageData', () => {
    it('returns null fields immediately when apiKey is null', async () => {
      const { http, fetchJson } = makeMockHttp()
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('lodash', 'nodejs', null)
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
      expect(fetchJson).not.toHaveBeenCalled()
    })

    it('returns sourceRank and dependentCount from API', async () => {
      const { http } = makeMockHttp(() => Promise.resolve(LIBRARIES_IO_RESPONSE))
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('lodash', 'nodejs', 'test-key')
      expect(result.sourceRank).toBe(28)
      expect(result.dependentCount).toBe(150000)
    })

    it('maps ecosystem nodejs → npm platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve(LIBRARIES_IO_RESPONSE)
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('lodash', 'nodejs', 'api-key')
      expect(capturedUrl).toContain('/npm/lodash')
    })

    it('maps ecosystem python → pypi platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 5, dependents_count: 500 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('requests', 'python', 'api-key')
      expect(capturedUrl).toContain('/pypi/requests')
    })

    it('maps ecosystem rust → cargo platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 10, dependents_count: 1000 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('serde', 'rust', 'api-key')
      expect(capturedUrl).toContain('/cargo/serde')
    })

    it('maps ecosystem golang → go platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 15, dependents_count: 2000 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('github.com/user/pkg', 'golang', 'api-key')
      expect(capturedUrl).toContain('/go/')
    })

    it('maps ecosystem dotnet → nuget platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 20, dependents_count: 3000 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('Newtonsoft.Json', 'dotnet', 'api-key')
      expect(capturedUrl).toContain('/nuget/')
    })

    it('maps ecosystem java → maven platform', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 25, dependents_count: 4000 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('log4j', 'java', 'api-key')
      expect(capturedUrl).toContain('/maven/')
    })

    it('passes api key as Authorization header, not in query string', async () => {
      let capturedUrl = ''
      let capturedInit: RequestInit | undefined
      const { http } = makeMockHttp((url, init) => {
        capturedUrl = url
        capturedInit = init
        return Promise.resolve(LIBRARIES_IO_RESPONSE)
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('lodash', 'nodejs', 'my-secret-key')
      const headers = capturedInit?.headers as Record<string, string>
      expect(capturedUrl).not.toContain('my-secret-key')
      expect(headers['Authorization']).toBe('Token my-secret-key')
    })

    it('returns null fields on API error', async () => {
      const { http } = makeMockHttp(() => Promise.reject(new Error('HTTP 404')))
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('unknown-pkg', 'nodejs', 'api-key')
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
    })

    it('returns null fields on network error', async () => {
      const { http } = makeMockHttp(() => Promise.reject(new Error('Network error')))
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('pkg', 'nodejs', 'api-key')
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
    })

    it('never throws', async () => {
      const { http } = makeMockHttp(() => Promise.reject(new Error('Catastrophic failure')))
      const client = new LibrariesIoClient(http)
      await expect(client.getPackageData('pkg', 'nodejs', 'api-key')).resolves.not.toThrow()
    })

    it('uses correct base URL for libraries.io', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve(LIBRARIES_IO_RESPONSE)
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('lodash', 'nodejs', 'key')
      expect(capturedUrl).toMatch(/^https:\/\/libraries\.io\/api\//)
    })

    it('falls back to ecosystem name when not in platform map', async () => {
      let capturedUrl = ''
      const { http } = makeMockHttp((url) => {
        capturedUrl = url
        return Promise.resolve({ rank: 5, dependents_count: 100 })
      })
      const client = new LibrariesIoClient(http)
      await client.getPackageData('some-pkg', 'unknown-ecosystem', 'api-key')
      expect(capturedUrl).toContain('/unknown-ecosystem/')
    })

    it('handles null rank and null dependents_count in response', async () => {
      const { http } = makeMockHttp(() =>
        Promise.resolve({ rank: null, dependents_count: null })
      )
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('pkg', 'nodejs', 'api-key')
      expect(result.sourceRank).toBeNull()
      expect(result.dependentCount).toBeNull()
    })

    it('handles missing rank and dependents_count fields in response', async () => {
      const { http } = makeMockHttp(() => Promise.resolve({}))
      const client = new LibrariesIoClient(http)
      const result = await client.getPackageData('pkg', 'nodejs', 'api-key')
      expect(result.sourceRank).toBeNull()
      expect(result.dependentCount).toBeNull()
    })
  })
})
