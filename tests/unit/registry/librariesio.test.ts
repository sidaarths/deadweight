import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LibrariesIoClient } from '../../../src/registry/librariesio.js'

const mockFetch = vi.fn()

const LIBRARIES_IO_RESPONSE = {
  name: 'lodash',
  platform: 'npm',
  rank: 28,
  dependents_count: 150000,
}

describe('LibrariesIoClient', () => {
  let client: LibrariesIoClient

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    client = new LibrariesIoClient()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getPackageData', () => {
    it('returns null fields immediately when apiKey is null', async () => {
      const result = await client.getPackageData('lodash', 'nodejs', null)
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns sourceRank and dependentCount from API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(LIBRARIES_IO_RESPONSE),
      })

      const result = await client.getPackageData('lodash', 'nodejs', 'test-key')
      expect(result.sourceRank).toBe(28)
      expect(result.dependentCount).toBe(150000)
    })

    it('maps ecosystem nodejs → npm platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARIES_IO_RESPONSE) })
      })

      await client.getPackageData('lodash', 'nodejs', 'api-key')
      expect(capturedUrl).toContain('/npm/lodash')
    })

    it('maps ecosystem python → pypi platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rank: 5, dependents_count: 500 }) })
      })

      await client.getPackageData('requests', 'python', 'api-key')
      expect(capturedUrl).toContain('/pypi/requests')
    })

    it('maps ecosystem rust → cargo platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rank: 10, dependents_count: 1000 }) })
      })

      await client.getPackageData('serde', 'rust', 'api-key')
      expect(capturedUrl).toContain('/cargo/serde')
    })

    it('maps ecosystem golang → go platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rank: 15, dependents_count: 2000 }) })
      })

      await client.getPackageData('github.com/user/pkg', 'golang', 'api-key')
      expect(capturedUrl).toContain('/go/')
    })

    it('maps ecosystem dotnet → nuget platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rank: 20, dependents_count: 3000 }) })
      })

      await client.getPackageData('Newtonsoft.Json', 'dotnet', 'api-key')
      expect(capturedUrl).toContain('/nuget/')
    })

    it('maps ecosystem java → maven platform', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rank: 25, dependents_count: 4000 }) })
      })

      await client.getPackageData('log4j', 'java', 'api-key')
      expect(capturedUrl).toContain('/maven/')
    })

    it('includes api_key in query string', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARIES_IO_RESPONSE) })
      })

      await client.getPackageData('lodash', 'nodejs', 'my-secret-key')
      expect(capturedUrl).toContain('api_key=my-secret-key')
    })

    it('returns null fields on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })
      const result = await client.getPackageData('unknown-pkg', 'nodejs', 'api-key')
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
    })

    it('returns null fields on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      const result = await client.getPackageData('pkg', 'nodejs', 'api-key')
      expect(result).toEqual({ sourceRank: null, dependentCount: null })
    })

    it('never throws', async () => {
      mockFetch.mockRejectedValue(new Error('Catastrophic failure'))
      await expect(client.getPackageData('pkg', 'nodejs', 'api-key')).resolves.not.toThrow()
    })

    it('uses correct base URL for libraries.io', async () => {
      let capturedUrl = ''
      mockFetch.mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARIES_IO_RESPONSE) })
      })

      await client.getPackageData('lodash', 'nodejs', 'key')
      expect(capturedUrl).toMatch(/^https:\/\/libraries\.io\/api\//)
    })
  })
})
