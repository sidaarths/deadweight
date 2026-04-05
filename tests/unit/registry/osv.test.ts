import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OsvClient } from '../../../src/registry/osv.js'

const mockFetch = vi.fn()

const OSV_RESPONSE_WITH_VULNS = {
  vulns: [
    {
      id: 'GHSA-1234-abcd-5678',
      summary: 'Critical remote code execution vulnerability',
      published: '2023-06-15T10:00:00Z',
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
    },
    {
      id: 'GHSA-9876-wxyz-1234',
      summary: 'Medium severity information disclosure',
      published: '2023-03-01T00:00:00Z',
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N' }],
      database_specific: { severity: 'MEDIUM' },
    },
  ],
}

const OSV_RESPONSE_EMPTY = {}

describe('OsvClient', () => {
  let client: OsvClient

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    client = new OsvClient()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getVulnerabilities', () => {
    it('returns empty array when no vulnerabilities found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(OSV_RESPONSE_EMPTY),
      })

      const result = await client.getVulnerabilities('safe-package', 'nodejs')
      expect(result).toEqual([])
    })

    it('returns vulnerabilities for a package', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(OSV_RESPONSE_WITH_VULNS),
      })

      const result = await client.getVulnerabilities('vulnerable-pkg', 'nodejs')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('GHSA-1234-abcd-5678')
      expect(result[0].summary).toBe('Critical remote code execution vulnerability')
    })

    it('parses publishedAt as Date', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(OSV_RESPONSE_WITH_VULNS),
      })

      const result = await client.getVulnerabilities('vulnerable-pkg', 'nodejs')
      expect(result[0].publishedAt).toBeInstanceOf(Date)
      expect(result[0].publishedAt?.toISOString()).toBe('2023-06-15T10:00:00.000Z')
    })

    it('maps CVSS score 9.0+ to CRITICAL severity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-001',
            summary: 'Critical vuln',
            published: '2023-01-01T00:00:00Z',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H' }],
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBe('CRITICAL')
    })

    it('maps CVSS score 7.0-8.9 to HIGH severity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-002',
            summary: 'High vuln',
            published: '2023-01-01T00:00:00Z',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N' }],
            database_specific: { severity: 'HIGH' },
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBe('HIGH')
    })

    it('uses database_specific.severity as fallback when severity array missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-003',
            summary: 'Medium vuln',
            published: '2023-01-01T00:00:00Z',
            database_specific: { severity: 'MEDIUM' },
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBe('MEDIUM')
    })

    it('returns null severity when no severity info available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-004',
            summary: 'Unknown severity',
            published: '2023-01-01T00:00:00Z',
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBeNull()
    })

    it('POSTs to OSV API with correct ecosystem mapping for nodejs', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('express', 'nodejs')
      expect(capturedBody).toMatchObject({
        package: { name: 'express', ecosystem: 'npm' },
      })
    })

    it('maps ecosystem python → PyPI', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('requests', 'python')
      expect((capturedBody as { package: { ecosystem: string } }).package.ecosystem).toBe('PyPI')
    })

    it('maps ecosystem rust → crates.io', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('serde', 'rust')
      expect((capturedBody as { package: { ecosystem: string } }).package.ecosystem).toBe('crates.io')
    })

    it('maps ecosystem golang → Go', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('golang.org/x/net', 'golang')
      expect((capturedBody as { package: { ecosystem: string } }).package.ecosystem).toBe('Go')
    })

    it('maps ecosystem dotnet → NuGet', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('Newtonsoft.Json', 'dotnet')
      expect((capturedBody as { package: { ecosystem: string } }).package.ecosystem).toBe('NuGet')
    })

    it('maps ecosystem java → Maven', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('log4j', 'java')
      expect((capturedBody as { package: { ecosystem: string } }).package.ecosystem).toBe('Maven')
    })

    it('includes version in request when provided', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('lodash', 'nodejs', '4.17.20')
      expect((capturedBody as { version: string }).version).toBe('4.17.20')
    })

    it('omits version field when not provided', async () => {
      let capturedBody: unknown = null
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      await client.getVulnerabilities('lodash', 'nodejs')
      expect((capturedBody as Record<string, unknown>).version).toBeUndefined()
    })

    it('returns [] on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result).toEqual([])
    })

    it('returns [] on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result).toEqual([])
    })

    it('never throws', async () => {
      mockFetch.mockRejectedValue(new Error('Catastrophic failure'))
      await expect(client.getVulnerabilities('pkg', 'nodejs')).resolves.not.toThrow()
    })

    it('maps CVSS score < 4.0 to LOW severity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-LOW',
            summary: 'Low severity vuln',
            published: '2023-01-01T00:00:00Z',
            // CVSS:3.1 AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N → score ~1.8
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N' }],
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBe('LOW')
    })

    it('maps CVSS score 4.0-6.9 to MEDIUM severity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          vulns: [{
            id: 'TEST-MED',
            summary: 'Medium severity vuln',
            published: '2023-01-01T00:00:00Z',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N' }],
          }],
        }),
      })

      const result = await client.getVulnerabilities('pkg', 'nodejs')
      expect(result[0].severity).toBe('MEDIUM')
    })
  })
})
