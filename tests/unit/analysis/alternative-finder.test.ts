import { describe, it, expect, vi } from 'vitest'
import { findAlternatives } from '../../../src/analysis/alternative-finder.js'
import { Ecosystem } from '../../../src/types/index.js'
import type { RegistryMetadata } from '../../../src/types/index.js'

function makeMetadata(weeklyDownloads: number, maintainerCount: number, daysAgo: number): RegistryMetadata {
  const lastPublishDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    maintainers: Array.from({ length: maintainerCount }, (_, i) => ({ name: `author${i}` })),
    lastPublishDate,
    weeklyDownloads,
    license: 'MIT',
    repositoryUrl: null,
    description: null,
    homepage: null,
    deprecated: null,
  }
}

describe('findAlternatives', () => {
  it('returns empty array for unknown package (other category)', async () => {
    const result = await findAlternatives({
      packageName: 'some-random-xyz-package',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result).toEqual([])
  })

  it('returns alternatives for axios (http-client category)', async () => {
    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result.length).toBeGreaterThan(0)
    const names = result.map(a => a.name)
    expect(names).not.toContain('axios') // excludes itself
  })

  it('returns up to 5 alternatives', async () => {
    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('excludes the input package from alternatives', async () => {
    const result = await findAlternatives({
      packageName: 'moment',
      ecosystem: Ecosystem.nodejs,
    })
    const names = result.map(a => a.name)
    expect(names).not.toContain('moment')
  })

  it('uses npmClient to fetch metadata when provided', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn().mockResolvedValue(makeMetadata(500000, 3, 30)),
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    expect(mockNpmClient.getMetadata).toHaveBeenCalled()
    expect(result.length).toBeGreaterThan(0)
  })

  it('computes score based on downloads, maintainers, and recency', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn().mockResolvedValue(makeMetadata(4_000_000, 4, 30)), // high downloads, 4 maintainers, 30 days ago
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    expect(result.length).toBeGreaterThan(0)
    // Score should be non-zero for a healthy package
    expect(result[0].score).toBeGreaterThan(0)
  })

  it('score is between 0 and 100', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn().mockResolvedValue(makeMetadata(10_000_000, 10, 10)),
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    for (const alt of result) {
      expect(alt.score).toBeGreaterThanOrEqual(0)
      expect(alt.score).toBeLessThanOrEqual(100)
    }
  })

  it('sorts alternatives by score descending', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn()
        .mockResolvedValueOnce(makeMetadata(4_000_000, 5, 30))
        .mockResolvedValueOnce(makeMetadata(100_000, 1, 365))
        .mockResolvedValueOnce(makeMetadata(2_000_000, 3, 60))
        .mockResolvedValueOnce(makeMetadata(500_000, 2, 90))
        .mockResolvedValueOnce(makeMetadata(1_000_000, 4, 45)),
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score)
    }
  })

  it('handles npmClient getMetadata returning null gracefully', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn().mockResolvedValue(null),
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    // Should still return alternatives, just with default scores
    expect(Array.isArray(result)).toBe(true)
  })

  it('sets weeklyDownloads from metadata', async () => {
    const mockNpmClient = {
      ecosystem: Ecosystem.nodejs,
      getMetadata: vi.fn().mockResolvedValue(makeMetadata(1_500_000, 3, 30)),
    }

    const result = await findAlternatives({
      packageName: 'axios',
      ecosystem: Ecosystem.nodejs,
      npmClient: mockNpmClient as any,
    })
    if (result.length > 0) {
      expect(result[0].weeklyDownloads).toBe(1_500_000)
    }
  })

  it('returns alternatives for logger packages', async () => {
    const result = await findAlternatives({
      packageName: 'winston',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result.length).toBeGreaterThan(0)
    const names = result.map(a => a.name)
    expect(names).not.toContain('winston')
  })

  it('returns alternatives for validation packages', async () => {
    const result = await findAlternatives({
      packageName: 'zod',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result.length).toBeGreaterThan(0)
    expect(result.map(a => a.name)).not.toContain('zod')
  })
})
