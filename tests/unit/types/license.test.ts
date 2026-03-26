import { describe, it, expect } from 'vitest'
import type { LicenseInfo, LicenseConflict, LicenseConflictType } from '@/types/license'
import { Ecosystem } from '@/types/ecosystem'

describe('License types', () => {
  it('creates a valid LicenseInfo', () => {
    const info: LicenseInfo = {
      raw: 'MIT',
      spdx: 'MIT',
      isOsiApproved: true,
      isCopyleft: false,
      isCommerciallyRestrictive: false,
    }
    expect(info.spdx).toBe('MIT')
    expect(info.isCopyleft).toBe(false)
  })

  it('handles unknown license', () => {
    const info: LicenseInfo = {
      raw: 'UNLICENSED',
      spdx: null,
      isOsiApproved: false,
      isCopyleft: false,
      isCommerciallyRestrictive: true,
    }
    expect(info.spdx).toBeNull()
  })

  it('creates a valid LicenseConflict', () => {
    const conflict: LicenseConflict = {
      type: 'copyleft_in_proprietary',
      severity: 'critical',
      packageA: { name: 'some-gpl-pkg', version: '1.0.0', ecosystem: Ecosystem.nodejs, directDependency: false },
      packageB: null,
      description: 'GPL-3.0 transitive dependency conflicts with proprietary project license',
      path: ['my-app', 'some-direct-dep', 'some-gpl-pkg'],
    }
    expect(conflict.type).toBe('copyleft_in_proprietary')
    expect(conflict.path).toHaveLength(3)
  })
})
