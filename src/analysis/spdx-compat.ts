import spdxCorrect from 'spdx-correct'

export function normalizeSpdx(raw: string | null): string | null {
  if (!raw) return null
  try {
    const corrected = spdxCorrect(raw)
    return corrected ?? null
  } catch {
    return null
  }
}

const COPYLEFT_PREFIXES = [
  'GPL-2.0',
  'GPL-3.0',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'AGPL-3.0',
  'MPL-2.0',
]

const STRONG_COPYLEFT_PREFIXES = [
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
]

const NON_COMMERCIAL_IDS = [
  'BUSL-1.1',
  'Elastic-2.0',
]

const NON_COMMERCIAL_PREFIXES = [
  'CC-BY-NC',
]

export function isCopyleft(spdxId: string): boolean {
  return COPYLEFT_PREFIXES.some(prefix => spdxId === prefix || spdxId.startsWith(`${prefix}-`))
}

export function isStrongCopyleft(spdxId: string): boolean {
  return STRONG_COPYLEFT_PREFIXES.some(prefix => spdxId === prefix || spdxId.startsWith(`${prefix}-`))
}

export function isNonCommercial(spdxId: string): boolean {
  if (NON_COMMERCIAL_IDS.includes(spdxId)) return true
  if (NON_COMMERCIAL_PREFIXES.some(prefix => spdxId.startsWith(prefix))) return true
  // Handle Commons-Clause variants (e.g. "MIT AND Commons-Clause")
  if (spdxId.includes('Commons-Clause')) return true
  return false
}

export function isCommerciallyCompatible(licenseA: string, licenseB: string): boolean {
  return !isNonCommercial(licenseA) && !isNonCommercial(licenseB)
}

export const PROPRIETARY_PROJECT_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Unlicense',
  '0BSD',
])

export function areCompatible(licenseA: string, licenseB: string): boolean {
  // Non-commercial licenses are incompatible
  if (!isCommerciallyCompatible(licenseA, licenseB)) return false

  // GPL-2.0 + GPL-3.0 incompatibility (only-clause prevents mixing)
  const aIsGpl2 = licenseA === 'GPL-2.0' || licenseA.startsWith('GPL-2.0-')
  const bIsGpl2 = licenseB === 'GPL-2.0' || licenseB.startsWith('GPL-2.0-')
  const aIsGpl3 = licenseA === 'GPL-3.0' || licenseA.startsWith('GPL-3.0-')
  const bIsGpl3 = licenseB === 'GPL-3.0' || licenseB.startsWith('GPL-3.0-')

  if ((aIsGpl2 && bIsGpl3) || (aIsGpl3 && bIsGpl2)) return false

  // AGPL-3.0 in any pair is a warning (treated as incompatible here)
  const aIsAgpl = licenseA === 'AGPL-3.0' || licenseA.startsWith('AGPL-3.0-')
  const bIsAgpl = licenseB === 'AGPL-3.0' || licenseB.startsWith('AGPL-3.0-')
  if (aIsAgpl || bIsAgpl) return false

  // Strong copyleft dep (licenseA) in a proprietary project (licenseB) is a conflict.
  // The reverse (permissive dep in a copyleft project) is fine.
  if (isStrongCopyleft(licenseA) && PROPRIETARY_PROJECT_LICENSES.has(licenseB)) return false

  return true
}
