import { z } from 'zod'
import { Ecosystem } from './ecosystem.js'

// 10 MB upper bound — orders of magnitude larger than any real manifest file
const MAX_CONTENT_BYTES = 10_000_000

// Helper for tools that accept manifest input — exactly one of path or content
const manifestInput = z.object({
  path: z.string().min(1).optional(),
  content: z.string().min(1).max(MAX_CONTENT_BYTES).optional(),
}).refine(
  (data) => !!(data.path ?? data.content) && !(data.path && data.content),
  { message: 'Provide exactly one of: path or content' }
)

export const AnalyzeDependencyTreeSchema = manifestInput.extend({
  includeDevDependencies: z.boolean().optional().default(false),
})

export const FindSingleMaintainerSchema = manifestInput.extend({
  minDependents: z.number().int().min(0).optional().default(0),
})

export const FlagAbandonedSchema = manifestInput.extend({
  maxAgeYears: z.number().positive().optional().default(2),
})

export const GetLicenseConflictsSchema = manifestInput.extend({
  // Caller should pass a valid SPDX identifier (e.g. "MIT", "GPL-3.0-only")
  // Phase 2 will add spdx-correct validation here
  projectLicense: z.string().min(1).optional(),
})

export const SuggestConsolidationsSchema = manifestInput

export const GetHealthReportSchema = manifestInput.extend({
  includeDevDependencies: z.boolean().optional().default(false),
})

export const CompareAlternativeSchema = z.object({
  packageName: z.string().min(1),
  ecosystem: z.enum(Object.values(Ecosystem) as [Ecosystem, ...Ecosystem[]]),
})

export const GetEcosystemSummarySchema = manifestInput

export type AnalyzeDependencyTreeInput = z.infer<typeof AnalyzeDependencyTreeSchema>
export type FindSingleMaintainerInput = z.infer<typeof FindSingleMaintainerSchema>
export type FlagAbandonedInput = z.infer<typeof FlagAbandonedSchema>
export type GetLicenseConflictsInput = z.infer<typeof GetLicenseConflictsSchema>
export type SuggestConsolidationsInput = z.infer<typeof SuggestConsolidationsSchema>
export type GetHealthReportInput = z.infer<typeof GetHealthReportSchema>
export type CompareAlternativeInput = z.infer<typeof CompareAlternativeSchema>
export type GetEcosystemSummaryInput = z.infer<typeof GetEcosystemSummarySchema>
