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
