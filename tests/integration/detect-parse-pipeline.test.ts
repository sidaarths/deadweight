/**
 * Journey 3: detect → parse pipeline
 *
 * Tests that detectEcosystem and NodejsParser compose correctly for various
 * inputs. No network calls are made here — this pipeline is entirely local.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectEcosystem } from '../../src/parsers/detect.js'
import { NodejsParser } from '../../src/parsers/nodejs/parser.js'
import { Ecosystem } from '../../src/types/index.js'

const FIXTURES = join(import.meta.dirname, '../fixtures/nodejs')

describe('Journey 3: detect → parse pipeline', () => {
  const parser = new NodejsParser()

  // -------------------------------------------------------------------------
  // 1. package.json path auto-detected
  // -------------------------------------------------------------------------
  describe('1. package.json path auto-detected', () => {
    it('detects nodejs from a package.json file path', () => {
      const ecosystem = detectEcosystem('/project/package.json')
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })

    it('parser accepts package.json content after detection', async () => {
      const filePath = '/project/package.json'
      const ecosystem = detectEcosystem(filePath)
      expect(ecosystem).toBe(Ecosystem.nodejs)

      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content, filePath)
      expect(manifest.ecosystem).toBe(Ecosystem.nodejs)
    })

    it('parsed manifest has dependencies as a Map', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package.json')
      expect(manifest.dependencies).toBeInstanceOf(Map)
    })

    it('parsed manifest has devDependencies as a Map', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package.json')
      expect(manifest.devDependencies).toBeInstanceOf(Map)
    })

    it('dependencies Map contains the correct direct deps', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package.json')
      expect(manifest.dependencies.has('lodash')).toBe(true)
      expect(manifest.dependencies.has('express')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // 2. package-lock.json path auto-detected
  // -------------------------------------------------------------------------
  describe('2. package-lock.json path auto-detected', () => {
    it('detects nodejs from a package-lock.json file path', () => {
      const ecosystem = detectEcosystem('/project/package-lock.json')
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })

    it('parser resolves all packages from lockfile after detection', async () => {
      const filePath = '/project/package-lock.json'
      const ecosystem = detectEcosystem(filePath)
      expect(ecosystem).toBe(Ecosystem.nodejs)

      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const manifest = await parser.parse(content, filePath)
      expect(manifest.resolvedVersions.size).toBeGreaterThan(0)
    })

    it('resolvedVersions is a Map (not a plain object)', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package-lock.json')
      expect(manifest.resolvedVersions).toBeInstanceOf(Map)
    })

    it('lockfile parse emits no warnings', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package-lock.json')
      expect(manifest.warnings).toHaveLength(0)
    })

    it('resolvedVersions has concrete version strings (not ranges)', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const manifest = await parser.parse(content, '/project/package-lock.json')
      // lodash resolved to exact version
      expect(manifest.resolvedVersions.get('lodash')).toBe('4.17.21')
      expect(manifest.resolvedVersions.get('express')).toBe('4.18.2')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Content-only detection from lockfile JSON
  // -------------------------------------------------------------------------
  describe('3. Content-only detection from lockfile JSON', () => {
    it('detects nodejs from raw lockfile JSON when no path is given', () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const ecosystem = detectEcosystem(undefined, content)
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })

    it('detects nodejs from raw package.json when no path is given', () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const ecosystem = detectEcosystem(undefined, content)
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })

    it('parser correctly parses lockfile content detected without a path', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      // Detection succeeds without path
      const ecosystem = detectEcosystem(undefined, content)
      expect(ecosystem).toBe(Ecosystem.nodejs)

      // Parsing also succeeds without path
      const manifest = await parser.parse(content)
      expect(manifest.ecosystem).toBe(Ecosystem.nodejs)
      expect(manifest.resolvedVersions.size).toBeGreaterThan(0)
    })

    it('detects nodejs from inline JSON containing lockfileVersion key', () => {
      const inlineContent = JSON.stringify({
        lockfileVersion: 3,
        packages: {},
      })
      const ecosystem = detectEcosystem(undefined, inlineContent)
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })

    it('detects nodejs from inline JSON containing devDependencies key only', () => {
      const inlineContent = JSON.stringify({
        devDependencies: { typescript: '^5.0.0' },
      })
      const ecosystem = detectEcosystem(undefined, inlineContent)
      expect(ecosystem).toBe(Ecosystem.nodejs)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Unknown file returns null from detect — graceful, not crash
  // -------------------------------------------------------------------------
  describe('4. Unknown file returns null from detect', () => {
    it('returns null for a .md file path', () => {
      expect(detectEcosystem('/project/README.md')).toBeNull()
    })

    it('returns null for an unrecognized extension', () => {
      expect(detectEcosystem('/project/something.xyz')).toBeNull()
    })

    it('returns null when called with no arguments', () => {
      expect(detectEcosystem()).toBeNull()
    })

    it('returns null when content is a plain string (not JSON, not requirements.txt)', () => {
      expect(detectEcosystem(undefined, 'hello world')).toBeNull()
    })

    it('returns null when content is valid JSON but has no recognized keys', () => {
      const content = JSON.stringify({ foo: 'bar', baz: 42 })
      expect(detectEcosystem(undefined, content)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // 5. Parser produces correct Map types
  // -------------------------------------------------------------------------
  describe('5. Parser produces correct Map types', () => {
    it('dependencies field from package.json is a Map<string, string>', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content)
      expect(manifest.dependencies).toBeInstanceOf(Map)
      for (const [key, value] of manifest.dependencies) {
        expect(typeof key).toBe('string')
        expect(typeof value).toBe('string')
      }
    })

    it('devDependencies field from package.json is a Map<string, string>', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content)
      expect(manifest.devDependencies).toBeInstanceOf(Map)
      for (const [key, value] of manifest.devDependencies) {
        expect(typeof key).toBe('string')
        expect(typeof value).toBe('string')
      }
    })

    it('resolvedVersions field from lockfile is a Map<string, string>', async () => {
      const content = readFileSync(join(FIXTURES, 'package-lock.json'), 'utf-8')
      const manifest = await parser.parse(content)
      expect(manifest.resolvedVersions).toBeInstanceOf(Map)
      for (const [key, value] of manifest.resolvedVersions) {
        expect(typeof key).toBe('string')
        expect(typeof value).toBe('string')
      }
    })

    it('dependencies field is NOT a plain object (has Map.prototype methods)', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content)
      // A plain object would not have .get()
      expect(typeof manifest.dependencies.get).toBe('function')
      expect(typeof manifest.dependencies.has).toBe('function')
      expect(typeof manifest.dependencies.size).toBe('number')
    })

    it('scoped package names are stored correctly in resolvedVersions Map', async () => {
      const content = readFileSync(
        join(FIXTURES, 'package-lock-scoped.json'),
        'utf-8',
      )
      const manifest = await parser.parse(content)
      // Key should be "@types/node", not "node_modules/@types/node"
      expect(manifest.resolvedVersions.has('@types/node')).toBe(true)
      expect(manifest.resolvedVersions.get('@types/node')).toBe('20.11.0')
    })

    it('devDependencies Map correctly maps typescript version range from package.json', async () => {
      const content = readFileSync(join(FIXTURES, 'package.json'), 'utf-8')
      const manifest = await parser.parse(content)
      expect(manifest.devDependencies.get('typescript')).toBe('^5.0.0')
    })
  })
})
