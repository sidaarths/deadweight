import { describe, it, expect } from 'vitest'
import {
  AnalyzeDependencyTreeSchema,
  FindSingleMaintainerSchema,
  FlagAbandonedSchema,
  GetLicenseConflictsSchema,
  SuggestConsolidationsSchema,
  GetHealthReportSchema,
  CompareAlternativeSchema,
  GetEcosystemSummarySchema,
} from '@/types/tool-schemas'
import { Ecosystem } from '@/types/ecosystem'

describe('Tool input schemas', () => {
  describe('AnalyzeDependencyTreeSchema', () => {
    it('accepts valid path input', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({ path: '/project/package.json' })
      expect(result.success).toBe(true)
    })

    it('accepts valid content input', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({ content: '{"dependencies":{}}' })
      expect(result.success).toBe(true)
    })

    it('rejects input with neither path nor content', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects both path and content provided together', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({
        path: '/project/package.json',
        content: '{}',
      })
      expect(result.success).toBe(false)
    })

    it('accepts optional includeDevDependencies', () => {
      const result = AnalyzeDependencyTreeSchema.safeParse({
        path: '/project/package.json',
        includeDevDependencies: true,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CompareAlternativeSchema', () => {
    it('accepts valid ecosystem and package name', () => {
      const result = CompareAlternativeSchema.safeParse({
        packageName: 'moment',
        ecosystem: Ecosystem.nodejs,
      })
      expect(result.success).toBe(true)
    })

    it('rejects unknown ecosystem', () => {
      const result = CompareAlternativeSchema.safeParse({
        packageName: 'moment',
        ecosystem: 'ruby',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty package name', () => {
      const result = CompareAlternativeSchema.safeParse({
        packageName: '',
        ecosystem: Ecosystem.nodejs,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('FlagAbandonedSchema', () => {
    it('accepts optional maxAgeYears', () => {
      const result = FlagAbandonedSchema.safeParse({
        path: '/project/package.json',
        maxAgeYears: 3,
      })
      expect(result.success).toBe(true)
    })

    it('rejects negative maxAgeYears', () => {
      const result = FlagAbandonedSchema.safeParse({
        path: '/project/package.json',
        maxAgeYears: -1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('GetLicenseConflictsSchema', () => {
    it('accepts optional project license', () => {
      const result = GetLicenseConflictsSchema.safeParse({
        path: '/project/package.json',
        projectLicense: 'MIT',
      })
      expect(result.success).toBe(true)
    })
  })
})
