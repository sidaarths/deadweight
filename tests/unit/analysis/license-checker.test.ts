import { describe, it, expect } from 'vitest'
import { checkLicenses } from '../../../src/analysis/license-checker.js'
import type { DependencyTree, DependencyNode, Package } from '../../../src/types/index.js'
import { Ecosystem } from '../../../src/types/index.js'

function makeNode(
  name: string,
  license: string | null,
  deps: DependencyNode[] = [],
  directDependency = true,
  depth = 0,
): DependencyNode {
  return {
    name,
    version: '1.0.0',
    ecosystem: Ecosystem.nodejs,
    directDependency,
    depth,
    dependencies: deps,
    registryMetadata: {
      maintainers: [{ name: 'author' }],
      lastPublishDate: new Date('2023-01-01'),
      weeklyDownloads: 10000,
      license,
      repositoryUrl: null,
      description: null,
      homepage: null,
      deprecated: null,
    },
  }
}

function makeTree(rootDeps: DependencyNode[], projectLicense?: string): DependencyTree {
  return {
    root: {
      name: 'my-app',
      version: '1.0.0',
      ecosystem: Ecosystem.nodejs,
      directDependency: false,
      depth: 0,
      dependencies: rootDeps,
      registryMetadata: {
        maintainers: [],
        lastPublishDate: null,
        weeklyDownloads: null,
        license: projectLicense ?? 'MIT',
        repositoryUrl: null,
        description: null,
        homepage: null,
        deprecated: null,
      },
    },
    ecosystem: Ecosystem.nodejs,
    manifestPath: '/project/package.json',
    totalDirect: rootDeps.length,
    totalTransitive: 0,
    resolvedAt: new Date(),
  }
}

describe('checkLicenses', () => {
  it('returns empty array for tree with all MIT deps', () => {
    const tree = makeTree([
      makeNode('react', 'MIT'),
      makeNode('lodash', 'MIT'),
    ])
    const conflicts = checkLicenses(tree, 'MIT')
    expect(conflicts).toEqual([])
  })

  it('detects unknown_license when dep has unrecognized license', () => {
    const tree = makeTree([makeNode('my-lib', 'CUSTOM-LICENSE-1.0')])
    const conflicts = checkLicenses(tree, 'MIT')
    const unknownConflicts = conflicts.filter(c => c.type === 'unknown_license')
    expect(unknownConflicts.length).toBeGreaterThan(0)
    expect(unknownConflicts[0].severity).toBe('advisory')
  })

  it('does not flag unknown_license when license is null (no license info)', () => {
    const tree = makeTree([makeNode('no-license-pkg', null)])
    const conflicts = checkLicenses(tree, 'MIT')
    const unknownConflicts = conflicts.filter(c => c.type === 'unknown_license')
    expect(unknownConflicts).toHaveLength(0)
  })

  it('detects copyleft_in_proprietary when strong copyleft dep in MIT project', () => {
    const tree = makeTree([makeNode('gpl-lib', 'GPL-3.0')])
    const conflicts = checkLicenses(tree, 'MIT')
    const copyleftConflicts = conflicts.filter(c => c.type === 'copyleft_in_proprietary')
    expect(copyleftConflicts.length).toBeGreaterThan(0)
    expect(copyleftConflicts[0].severity).toBe('critical')
  })

  it('detects copyleft_in_proprietary for ISC project license', () => {
    const tree = makeTree([makeNode('gpl-lib', 'GPL-2.0')])
    const conflicts = checkLicenses(tree, 'ISC')
    const copyleftConflicts = conflicts.filter(c => c.type === 'copyleft_in_proprietary')
    expect(copyleftConflicts.length).toBeGreaterThan(0)
  })

  it('detects copyleft_in_proprietary for Apache-2.0 project license', () => {
    const tree = makeTree([makeNode('gpl-lib', 'GPL-3.0')])
    const conflicts = checkLicenses(tree, 'Apache-2.0')
    const copyleftConflicts = conflicts.filter(c => c.type === 'copyleft_in_proprietary')
    expect(copyleftConflicts.length).toBeGreaterThan(0)
  })

  it('does NOT flag copyleft_in_proprietary when LGPL in MIT project (weak copyleft)', () => {
    const tree = makeTree([makeNode('lgpl-lib', 'LGPL-2.1')])
    const conflicts = checkLicenses(tree, 'MIT')
    const copyleftConflicts = conflicts.filter(c => c.type === 'copyleft_in_proprietary')
    expect(copyleftConflicts).toHaveLength(0)
  })

  it('detects agpl_network_use when AGPL-3.0 dep found', () => {
    const tree = makeTree([makeNode('agpl-lib', 'AGPL-3.0')])
    const conflicts = checkLicenses(tree, 'MIT')
    const agplConflicts = conflicts.filter(c => c.type === 'agpl_network_use')
    expect(agplConflicts.length).toBeGreaterThan(0)
    expect(agplConflicts[0].severity).toBe('warning')
  })

  it('detects gpl2_gpl3_incompatibility when tree has both GPL-2.0 and GPL-3.0', () => {
    const tree = makeTree([
      makeNode('gpl2-lib', 'GPL-2.0'),
      makeNode('gpl3-lib', 'GPL-3.0'),
    ])
    // Use a GPL project to avoid copyleft-in-proprietary masking
    const conflicts = checkLicenses(tree, null)
    const gplConflicts = conflicts.filter(c => c.type === 'gpl2_gpl3_incompatibility')
    expect(gplConflicts.length).toBeGreaterThan(0)
    expect(gplConflicts[0].severity).toBe('critical')
  })

  it('detects non_commercial_in_production when BUSL dep found', () => {
    const tree = makeTree([makeNode('busl-lib', 'BUSL-1.1')])
    const conflicts = checkLicenses(tree, 'MIT')
    const ncConflicts = conflicts.filter(c => c.type === 'non_commercial_in_production')
    expect(ncConflicts.length).toBeGreaterThan(0)
    expect(ncConflicts[0].severity).toBe('critical')
  })

  it('includes package in conflict', () => {
    const tree = makeTree([makeNode('gpl-lib', 'GPL-3.0')])
    const conflicts = checkLicenses(tree, 'MIT')
    expect(conflicts.some(c => c.packageA.name === 'gpl-lib')).toBe(true)
  })

  it('includes dependency path in conflict', () => {
    const transitiveDep = makeNode('gpl-transitive', 'GPL-3.0', [], false, 2)
    const directDep = makeNode('wrapper', 'MIT', [transitiveDep], true, 1)
    const tree = makeTree([directDep])
    const conflicts = checkLicenses(tree, 'MIT')
    const gplConflict = conflicts.find(c => c.packageA.name === 'gpl-transitive')
    expect(gplConflict?.path).toBeDefined()
    expect(gplConflict?.path.length).toBeGreaterThan(0)
  })

  it('works with null projectLicense (no AGPL check for project)', () => {
    const tree = makeTree([makeNode('agpl-lib', 'AGPL-3.0')])
    // Should not throw, should still detect agpl_network_use
    expect(() => checkLicenses(tree, null)).not.toThrow()
    const conflicts = checkLicenses(tree, null)
    expect(conflicts.some(c => c.type === 'agpl_network_use')).toBe(true)
  })

  it('walks transitive dependencies', () => {
    const deepDep = makeNode('deep-gpl', 'GPL-3.0', [], false, 3)
    const midDep = makeNode('mid', 'MIT', [deepDep], false, 2)
    const tree = makeTree([makeNode('top', 'MIT', [midDep], true, 1)])
    const conflicts = checkLicenses(tree, 'MIT')
    expect(conflicts.some(c => c.packageA.name === 'deep-gpl')).toBe(true)
  })
})
