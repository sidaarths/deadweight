import { describe, it, expect } from 'vitest'
import { Ecosystem, ManifestType, ECOSYSTEM_MANIFEST_MAP } from '@/types/ecosystem'

describe('Ecosystem', () => {
  it('has all six supported ecosystems', () => {
    const values = Object.values(Ecosystem)
    expect(values).toHaveLength(6)
    expect(values).toContain('nodejs')
    expect(values).toContain('python')
    expect(values).toContain('dotnet')
    expect(values).toContain('rust')
    expect(values).toContain('golang')
    expect(values).toContain('java')
  })

  it('has manifest types for each ecosystem', () => {
    for (const eco of Object.values(Ecosystem)) {
      expect(ECOSYSTEM_MANIFEST_MAP[eco]).toBeDefined()
      expect(ECOSYSTEM_MANIFEST_MAP[eco].length).toBeGreaterThan(0)
    }
  })

  it('ManifestType values are unique strings', () => {
    const allTypes = Object.values(ECOSYSTEM_MANIFEST_MAP).flat()
    const unique = new Set(allTypes)
    expect(unique.size).toBe(allTypes.length)
  })
})
