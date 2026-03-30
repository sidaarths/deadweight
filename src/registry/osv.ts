import { z } from 'zod'
import { validateUrl } from './http.js'

export interface OsvVulnerability {
  id: string
  summary: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
  publishedAt: Date | null
}

const ECOSYSTEM_MAP: Record<string, string> = {
  nodejs: 'npm',
  python: 'PyPI',
  rust: 'crates.io',
  golang: 'Go',
  dotnet: 'NuGet',
  java: 'Maven',
}

const OsvResponseSchema = z.object({
  vulns: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional().default(''),
        published: z.string().optional().nullable(),
        severity: z
          .array(z.object({ type: z.string(), score: z.string() }))
          .optional(),
        database_specific: z
          .object({ severity: z.string().optional() })
          .optional()
          .nullable(),
      })
    )
    .optional()
    .default([]),
})

// CVSS v3 metric weights
const AV_MAP: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }
const AC_MAP: Record<string, number> = { L: 0.77, H: 0.44 }
const PR_UNSCOPED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 }
const PR_SCOPED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 }
const UI_MAP: Record<string, number> = { N: 0.85, R: 0.62 }
const IMP_MAP: Record<string, number> = { N: 0, L: 0.22, H: 0.56 }

function parseCvssScore(vector: string): number | null {
  const parts: Record<string, string> = {}
  const segments = vector.split('/')
  for (const seg of segments.slice(1)) {
    const colonIdx = seg.indexOf(':')
    if (colonIdx !== -1) parts[seg.slice(0, colonIdx)] = seg.slice(colonIdx + 1)
  }

  const av = AV_MAP[parts['AV']]
  const ac = AC_MAP[parts['AC']]
  const ui = UI_MAP[parts['UI']]
  const s = parts['S']
  if (s !== 'U' && s !== 'C') return null
  const pr = s === 'C' ? PR_SCOPED[parts['PR']] : PR_UNSCOPED[parts['PR']]
  const c = IMP_MAP[parts['C']]
  const i = IMP_MAP[parts['I']]
  const a = IMP_MAP[parts['A']]

  if ([av, ac, pr, ui, c, i, a].some(v => v === undefined)) return null

  const iscBase = 1 - (1 - c) * (1 - i) * (1 - a)
  let impact: number
  if (s === 'U') {
    impact = 6.42 * iscBase
  } else {
    impact = 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(iscBase - 0.02, 15)
  }

  if (impact <= 0) return 0

  const exploitability = 8.22 * av * ac * pr * ui

  const raw =
    s === 'U'
      ? Math.min(impact + exploitability, 10)
      : Math.min(1.08 * (impact + exploitability), 10)

  return Math.ceil(raw * 10) / 10
}

function severityFromCvssScore(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 9.0) return 'CRITICAL'
  if (score >= 7.0) return 'HIGH'
  if (score >= 4.0) return 'MEDIUM'
  return 'LOW'
}

function parseSeverity(
  severityArr: Array<{ type: string; score: string }> | undefined,
  dbSpecific: { severity?: string } | null | undefined
): OsvVulnerability['severity'] {
  if (severityArr && severityArr.length > 0) {
    const cvssEntry = severityArr.find(s => s.type.startsWith('CVSS'))
    if (cvssEntry) {
      const score = parseCvssScore(cvssEntry.score)
      if (score !== null) return severityFromCvssScore(score)
    }
  }

  const dbSev = dbSpecific?.severity?.toUpperCase()
  if (dbSev === 'CRITICAL' || dbSev === 'HIGH' || dbSev === 'MEDIUM' || dbSev === 'LOW') {
    return dbSev
  }

  return null
}

export class OsvClient {
  async getVulnerabilities(
    packageName: string,
    ecosystem: string,
    version?: string
  ): Promise<OsvVulnerability[]> {
    const osvEcosystem = ECOSYSTEM_MAP[ecosystem] ?? ecosystem

    const body: Record<string, unknown> = {
      package: { name: packageName, ecosystem: osvEcosystem },
    }
    if (version !== undefined) body['version'] = version

    const OSV_URL = 'https://api.osv.dev/v1/query'
    try {
      validateUrl(OSV_URL)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      let response: Response
      try {
        response = await fetch(OSV_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) return []

      const data = OsvResponseSchema.parse(await response.json())

      return data.vulns.map(v => ({
        id: v.id,
        summary: v.summary,
        severity: parseSeverity(v.severity, v.database_specific),
        publishedAt: v.published ? new Date(v.published) : null,
      }))
    } catch {
      return []
    }
  }
}
