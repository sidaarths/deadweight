import { describe, it, expect, vi } from 'vitest'
import { createCompareAlternativeTool } from '../../../src/tools/compare-alternative.js'
import { Ecosystem } from '../../../src/types/index.js'

describe('createCompareAlternativeTool', () => {
  it('has the correct tool name', () => {
    const tool = createCompareAlternativeTool()
    expect(tool.name).toBe('compare_alternative')
  })

  it('has a description', () => {
    const tool = createCompareAlternativeTool()
    expect(tool.description.length).toBeGreaterThan(10)
  })

  it('returns alternatives for a known package', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({ packageName: 'lodash', ecosystem: Ecosystem.nodejs })
    expect(Array.isArray(result.alternatives)).toBe(true)
    expect(result.alternatives.length).toBeGreaterThan(0)
  })

  it('does not include the queried package in alternatives', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
    const names = result.alternatives.map((a: { name: string }) => a.name)
    expect(names).not.toContain('axios')
  })

  it('returns empty alternatives for unknown package', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({
      packageName: 'some-completely-unknown-xyz-123',
      ecosystem: Ecosystem.nodejs,
    })
    expect(result.alternatives).toHaveLength(0)
  })

  it('returns at most 5 alternatives', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
    expect(result.alternatives.length).toBeLessThanOrEqual(5)
  })

  it('alternative objects have required fields', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
    for (const alt of result.alternatives) {
      expect(typeof alt.name).toBe('string')
      expect(alt.ecosystem).toBe(Ecosystem.nodejs)
      expect(typeof alt.score).toBe('number')
      expect(alt.score).toBeGreaterThanOrEqual(0)
      expect(alt.score).toBeLessThanOrEqual(100)
    }
  })

  it('uses metadata client to compute scores when provided', async () => {
    const getMetadata = vi.fn().mockResolvedValue({
      maintainers: [{ name: 'a' }, { name: 'b' }],
      lastPublishDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      weeklyDownloads: 2_000_000,
      license: 'MIT',
      repositoryUrl: null,
      description: null,
      homepage: null,
      deprecated: null,
    })
    const mockNpmClient = { getMetadata }
    const tool = createCompareAlternativeTool(mockNpmClient as any)
    const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
    expect(getMetadata).toHaveBeenCalled()
    expect(result.alternatives.length).toBeGreaterThan(0)
    expect(result.alternatives[0].score).toBeGreaterThan(50)
  })

  it('includes queried package info in output', async () => {
    const tool = createCompareAlternativeTool()
    const result = await tool.handler({ packageName: 'axios', ecosystem: Ecosystem.nodejs })
    expect(result.packageName).toBe('axios')
    expect(result.ecosystem).toBe(Ecosystem.nodejs)
  })
})
