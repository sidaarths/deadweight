import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodejsParser } from '../../../src/parsers/nodejs/parser.js'
import { Ecosystem } from '../../../src/types/index.js'

const FIXTURES = join(import.meta.dirname, '../../fixtures/nodejs')

describe('NodejsParser', () => {
  const parser = new NodejsParser()

  describe('parse package.json only (no lockfile)', () => {
    it('returns correct ecosystem', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('extracts direct dependencies', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.dependencies.get('lodash')).toBe('^4.17.21')
      expect(result.dependencies.get('express')).toBe('^4.18.2')
    })

    it('extracts dev dependencies', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.devDependencies.get('typescript')).toBe('^5.0.0')
    })

    it('emits a warning when no lockfile content provided', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.warnings.some(w => w.includes('lockfile'))).toBe(true)
    })

    it('has no resolved versions without lockfile', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.resolvedVersions.size).toBe(0)
    })
  })

  describe('parse package-lock.json v3', () => {
    it('resolves all packages including transitive', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.resolvedVersions.get('lodash')).toBe('4.17.21')
      expect(result.resolvedVersions.get('express')).toBe('4.18.2')
      expect(result.resolvedVersions.get('accepts')).toBe('1.3.8')
    })

    it('includes dev dependencies in resolved versions', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.resolvedVersions.get('typescript')).toBe('5.2.2')
    })

    it('emits no warnings when lockfile is provided', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.warnings).toHaveLength(0)
    })

    it('extracts direct deps from lockfile root entry', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const result = await parser.parse(content)
      expect(result.dependencies.has('lodash')).toBe(true)
      expect(result.dependencies.has('express')).toBe(true)
    })
  })

  describe('parse bun.lock', () => {
    it('detects ecosystem as nodejs', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('extracts root name from workspaces[""]', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.rootName).toBe('heist')
    })

    it('extracts dev dependencies from root workspace', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.devDependencies.get('typescript')).toBe('^5.9.3')
      expect(result.devDependencies.get('concurrently')).toBe('^9.2.1')
    })

    it('extracts resolved versions from packages map', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.get('@esbuild/aix-ppc64')).toBe('0.21.5')
    })

    it('emits a warning when root workspace has no runtime deps', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.warnings.some(w => w.includes('includeDevDependencies'))).toBe(true)
    })

    it('excludes workspace packages from resolvedVersions', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.has('@heist/client')).toBe(false)
      expect(result.resolvedVersions.has('@heist/server')).toBe(false)
    })

    it('excludes sub-path specifiers from resolvedVersions', async () => {
      const content = readFileSync(join(FIXTURES, 'bun.lock'), 'utf-8')
      const result = await parser.parse(content, '/project/bun.lock')
      for (const name of result.resolvedVersions.keys()) {
        if (!name.startsWith('@')) expect(name).not.toContain('/')
      }
    })

    it('throws a helpful error for bun.lockb binary format', async () => {
      await expect(parser.parse('binary content', '/project/bun.lockb')).rejects.toThrow(/binary/)
    })

    it('throws when bun.lock content is not parseable JSON5', async () => {
      await expect(
        parser.parse('{{{invalid', '/project/bun.lock')
      ).rejects.toThrow(/unexpected format/)
    })

    it('throws when bun.lock top-level value is not an object', async () => {
      await expect(
        parser.parse('"just a string"', '/project/bun.lock')
      ).rejects.toThrow(/unexpected top-level type/)
    })

    it('skips bun.lock package entries that are not arrays', async () => {
      // Line 133: entry is not an array → continue
      const content = JSON.stringify({
        lockfileVersion: 1,
        workspaces: { '': { name: 'app', dependencies: { lodash: '^4.0.0' } } },
        packages: {
          'not-an-array': 'just-a-string',
          'also-bad': { some: 'object' },
          'lodash': ['lodash@4.17.21', {}, {}, 'sha512-xxx=='],
        },
      })
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.has('not-an-array')).toBe(false)
      expect(result.resolvedVersions.has('also-bad')).toBe(false)
      expect(result.resolvedVersions.has('lodash')).toBe(true)
    })

    it('skips bun.lock package entries whose resolution contains @workspace:', async () => {
      // Line 135: resolution includes @workspace: but name is not in workspaceNames → continue
      const content = JSON.stringify({
        lockfileVersion: 1,
        workspaces: { '': { name: 'app', dependencies: { lodash: '^4.0.0' } } },
        packages: {
          'alias-pkg': ['alias-pkg@workspace:./local', {}, {}],
          'lodash': ['lodash@4.17.21', {}, {}, 'sha512-xxx=='],
        },
      })
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.has('alias-pkg')).toBe(false)
      expect(result.resolvedVersions.has('lodash')).toBe(true)
    })

    it('skips bun.lock package entries where no @ is found in resolution', async () => {
      // Line 137: lastAt <= 0 → skip (resolution has no version separator)
      const content = JSON.stringify({
        lockfileVersion: 1,
        workspaces: { '': { name: 'app', dependencies: { lodash: '^4.0.0' } } },
        packages: {
          'no-version': ['no-version-at-all', {}, {}],
          'lodash': ['lodash@4.17.21', {}, {}, 'sha512-xxx=='],
        },
      })
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.has('no-version')).toBe(false)
      expect(result.resolvedVersions.has('lodash')).toBe(true)
    })

    it('skips bun.lock package entries with empty version after @', async () => {
      // resolution string ends with '@' → version slice is '' → falsy → skipped
      const content = JSON.stringify({
        lockfileVersion: 1,
        workspaces: { '': { name: 'app', dependencies: { lodash: '^4.0.0' } } },
        packages: {
          'weird-pkg': ['weird-pkg@', {}, {}],
          'lodash': ['lodash@4.17.21', {}, {}, 'sha512-xxx=='],
        },
      })
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.resolvedVersions.has('weird-pkg')).toBe(false)
      expect(result.resolvedVersions.has('lodash')).toBe(true)
    })

    it('skips workspace: protocol deps from root workspace dependencies', async () => {
      const content = JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          '': { name: 'mono', dependencies: { '@internal/lib': 'workspace:*', lodash: '^4.0.0' } },
          packages: { name: '@internal/lib', version: '1.0.0' },
        },
        packages: {},
      })
      // bun.lock has trailing-comma JSON5 but we use plain JSON here —
      // parseBunLock strips commas then parses, so valid JSON also works
      const result = await parser.parse(content, '/project/bun.lock')
      expect(result.dependencies.has('@internal/lib')).toBe(false)
      expect(result.dependencies.has('lodash')).toBe(true)
    })
  })

  describe('parse package-lock.json edge cases', () => {
    it('skips non-root lockfile entries that fail schema validation', async () => {
      // An entry without a "version" field fails LockfilePackageSchema — should be silently skipped
      const lockfile = JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'test-app', dependencies: { 'good-pkg': '^1.0.0' } },
          'node_modules/good-pkg': { version: '1.0.0' },
          'node_modules/bad-pkg': { notAVersion: 'oops' },
        },
      })
      const result = await parser.parse(lockfile)
      expect(result.resolvedVersions.has('good-pkg')).toBe(true)
      expect(result.resolvedVersions.has('bad-pkg')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('throws on invalid JSON', async () => {
      await expect(parser.parse('not json')).rejects.toThrow()
    })

    it('throws when content is not a package.json or lockfile shape', async () => {
      await expect(parser.parse(JSON.stringify({ foo: 'bar' }))).rejects.toThrow()
    })
  })
})
