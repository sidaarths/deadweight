import { describe, it, expect } from 'vitest'
import {
  normalizeSpdx,
  isCopyleft,
  isStrongCopyleft,
  isNonCommercial,
  isCommerciallyCompatible,
  areCompatible,
} from '../../../src/analysis/spdx-compat.js'

describe('normalizeSpdx', () => {
  it('normalizes MIT to MIT', () => {
    expect(normalizeSpdx('MIT')).toBe('MIT')
  })

  it('normalizes apache-2.0 (case-insensitive) to Apache-2.0', () => {
    const result = normalizeSpdx('apache-2.0')
    expect(result).toBe('Apache-2.0')
  })

  it('normalizes GPL-2.0-only to GPL-2.0-only', () => {
    const result = normalizeSpdx('GPL-2.0-only')
    expect(result).not.toBeNull()
  })

  it('returns null for unrecognized license', () => {
    expect(normalizeSpdx('CUSTOM-PROPRIETARY-1.0')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(normalizeSpdx(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeSpdx('')).toBeNull()
  })

  it('normalizes BSD-3-Clause', () => {
    const result = normalizeSpdx('BSD-3-Clause')
    expect(result).toBe('BSD-3-Clause')
  })
})

describe('isCopyleft', () => {
  it('returns true for GPL-2.0', () => {
    expect(isCopyleft('GPL-2.0')).toBe(true)
  })

  it('returns true for GPL-3.0', () => {
    expect(isCopyleft('GPL-3.0')).toBe(true)
  })

  it('returns true for LGPL-2.0', () => {
    expect(isCopyleft('LGPL-2.0')).toBe(true)
  })

  it('returns true for LGPL-2.1', () => {
    expect(isCopyleft('LGPL-2.1')).toBe(true)
  })

  it('returns true for LGPL-3.0', () => {
    expect(isCopyleft('LGPL-3.0')).toBe(true)
  })

  it('returns true for AGPL-3.0', () => {
    expect(isCopyleft('AGPL-3.0')).toBe(true)
  })

  it('returns true for MPL-2.0', () => {
    expect(isCopyleft('MPL-2.0')).toBe(true)
  })

  it('returns false for MIT', () => {
    expect(isCopyleft('MIT')).toBe(false)
  })

  it('returns false for Apache-2.0', () => {
    expect(isCopyleft('Apache-2.0')).toBe(false)
  })

  it('returns false for ISC', () => {
    expect(isCopyleft('ISC')).toBe(false)
  })

  it('returns false for BSD-3-Clause', () => {
    expect(isCopyleft('BSD-3-Clause')).toBe(false)
  })

  it('handles variant suffix GPL-2.0-only', () => {
    expect(isCopyleft('GPL-2.0-only')).toBe(true)
  })

  it('handles variant suffix GPL-3.0-or-later', () => {
    expect(isCopyleft('GPL-3.0-or-later')).toBe(true)
  })
})

describe('isStrongCopyleft', () => {
  it('returns true for GPL-2.0', () => {
    expect(isStrongCopyleft('GPL-2.0')).toBe(true)
  })

  it('returns true for GPL-3.0', () => {
    expect(isStrongCopyleft('GPL-3.0')).toBe(true)
  })

  it('returns true for AGPL-3.0', () => {
    expect(isStrongCopyleft('AGPL-3.0')).toBe(true)
  })

  it('returns false for LGPL-2.1 (weak copyleft)', () => {
    expect(isStrongCopyleft('LGPL-2.1')).toBe(false)
  })

  it('returns false for MPL-2.0 (weak copyleft)', () => {
    expect(isStrongCopyleft('MPL-2.0')).toBe(false)
  })

  it('returns false for MIT', () => {
    expect(isStrongCopyleft('MIT')).toBe(false)
  })

  it('handles GPL-2.0-only variant', () => {
    expect(isStrongCopyleft('GPL-2.0-only')).toBe(true)
  })
})

describe('isNonCommercial', () => {
  it('returns true for BUSL-1.1', () => {
    expect(isNonCommercial('BUSL-1.1')).toBe(true)
  })

  it('returns true for Elastic-2.0', () => {
    expect(isNonCommercial('Elastic-2.0')).toBe(true)
  })

  it('returns true for CC-BY-NC-4.0', () => {
    expect(isNonCommercial('CC-BY-NC-4.0')).toBe(true)
  })

  it('returns true for CC-BY-NC-SA-4.0', () => {
    expect(isNonCommercial('CC-BY-NC-SA-4.0')).toBe(true)
  })

  it('returns false for MIT', () => {
    expect(isNonCommercial('MIT')).toBe(false)
  })

  it('returns false for Apache-2.0', () => {
    expect(isNonCommercial('Apache-2.0')).toBe(false)
  })

  it('returns false for GPL-3.0', () => {
    expect(isNonCommercial('GPL-3.0')).toBe(false)
  })
})

describe('isCommerciallyCompatible', () => {
  it('returns false when either license is non-commercial (BUSL-1.1)', () => {
    expect(isCommerciallyCompatible('MIT', 'BUSL-1.1')).toBe(false)
  })

  it('returns false when first license is non-commercial', () => {
    expect(isCommerciallyCompatible('BUSL-1.1', 'MIT')).toBe(false)
  })

  it('returns true for MIT + Apache-2.0 (both commercial)', () => {
    expect(isCommerciallyCompatible('MIT', 'Apache-2.0')).toBe(true)
  })

  it('returns true for MIT + GPL-3.0 (copyleft but commercial)', () => {
    expect(isCommerciallyCompatible('MIT', 'GPL-3.0')).toBe(true)
  })
})

describe('areCompatible', () => {
  it('MIT + MIT is compatible', () => {
    expect(areCompatible('MIT', 'MIT')).toBe(true)
  })

  it('MIT + Apache-2.0 is compatible', () => {
    expect(areCompatible('MIT', 'Apache-2.0')).toBe(true)
  })

  it('GPL-2.0 + GPL-3.0 is incompatible', () => {
    expect(areCompatible('GPL-2.0', 'GPL-3.0')).toBe(false)
  })

  it('GPL-3.0 + GPL-2.0 is incompatible (symmetric)', () => {
    expect(areCompatible('GPL-3.0', 'GPL-2.0')).toBe(false)
  })

  it('MIT + GPL-3.0 is considered compatible (permissive can be used with copyleft)', () => {
    expect(areCompatible('MIT', 'GPL-3.0')).toBe(true)
  })

  it('AGPL-3.0 in pair produces warning (returns false)', () => {
    expect(areCompatible('MIT', 'AGPL-3.0')).toBe(false)
  })

  it('strong copyleft (GPL-3.0) + proprietary (MIT project context) → conflict', () => {
    // When a strong copyleft dep is used in a MIT-licensed project, it creates conflict
    expect(areCompatible('GPL-3.0', 'MIT')).toBe(false)
  })

  it('BUSL-1.1 + MIT is incompatible (non-commercial)', () => {
    expect(areCompatible('BUSL-1.1', 'MIT')).toBe(false)
  })
})
