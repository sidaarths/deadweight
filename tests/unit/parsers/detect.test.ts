import { describe, it, expect } from 'vitest'
import { detectEcosystem } from '../../../src/parsers/detect.js'
import { Ecosystem } from '../../../src/types/index.js'

describe('detectEcosystem', () => {
  describe('by file path', () => {
    it('detects nodejs from package.json', () => {
      expect(detectEcosystem('/project/package.json')).toBe(Ecosystem.nodejs)
    })
    it('detects nodejs from package-lock.json', () => {
      expect(detectEcosystem('/project/package-lock.json')).toBe(Ecosystem.nodejs)
    })
    it('detects nodejs from yarn.lock', () => {
      expect(detectEcosystem('/project/yarn.lock')).toBe(Ecosystem.nodejs)
    })
    it('detects nodejs from pnpm-lock.yaml', () => {
      expect(detectEcosystem('/project/pnpm-lock.yaml')).toBe(Ecosystem.nodejs)
    })
    it('detects nodejs from bun.lock', () => {
      expect(detectEcosystem('/project/bun.lock')).toBe(Ecosystem.nodejs)
    })
    it('detects nodejs from bun.lockb', () => {
      expect(detectEcosystem('/project/bun.lockb')).toBe(Ecosystem.nodejs)
    })
    it('detects python from requirements.txt', () => {
      expect(detectEcosystem('/project/requirements.txt')).toBe(Ecosystem.python)
    })
    it('detects python from pyproject.toml', () => {
      expect(detectEcosystem('/project/pyproject.toml')).toBe(Ecosystem.python)
    })
    it('detects python from Pipfile', () => {
      expect(detectEcosystem('/project/Pipfile')).toBe(Ecosystem.python)
    })
    it('detects python from Pipfile.lock', () => {
      expect(detectEcosystem('/project/Pipfile.lock')).toBe(Ecosystem.python)
    })
    it('detects rust from Cargo.toml', () => {
      expect(detectEcosystem('/project/Cargo.toml')).toBe(Ecosystem.rust)
    })
    it('detects rust from Cargo.lock', () => {
      expect(detectEcosystem('/project/Cargo.lock')).toBe(Ecosystem.rust)
    })
    it('detects golang from go.mod', () => {
      expect(detectEcosystem('/project/go.mod')).toBe(Ecosystem.golang)
    })
    it('detects golang from go.sum', () => {
      expect(detectEcosystem('/project/go.sum')).toBe(Ecosystem.golang)
    })
    it('detects java from pom.xml', () => {
      expect(detectEcosystem('/project/pom.xml')).toBe(Ecosystem.java)
    })
    it('detects java from build.gradle', () => {
      expect(detectEcosystem('/project/build.gradle')).toBe(Ecosystem.java)
    })
    it('detects java from build.gradle.kts', () => {
      expect(detectEcosystem('/project/build.gradle.kts')).toBe(Ecosystem.java)
    })
    it('detects dotnet from a .csproj file', () => {
      expect(detectEcosystem('/project/MyApp.csproj')).toBe(Ecosystem.dotnet)
    })
    it('detects dotnet from packages.config', () => {
      expect(detectEcosystem('/project/packages.config')).toBe(Ecosystem.dotnet)
    })
    it('detects dotnet from Directory.Packages.props', () => {
      expect(detectEcosystem('/project/Directory.Packages.props')).toBe(Ecosystem.dotnet)
    })
    it('returns null for unknown file', () => {
      expect(detectEcosystem('/project/README.md')).toBeNull()
    })
  })

  describe('by content heuristic (no path)', () => {
    it('detects nodejs from JSON with dependencies key', () => {
      const content = JSON.stringify({ name: 'my-app', dependencies: { lodash: '^4.0.0' } })
      expect(detectEcosystem(undefined, content)).toBe(Ecosystem.nodejs)
    })
    it('detects python from requirements.txt content', () => {
      expect(detectEcosystem(undefined, 'requests==2.28.0\nflask>=2.0')).toBe(Ecosystem.python)
    })
    it('returns null when neither path nor content given', () => {
      expect(detectEcosystem()).toBeNull()
    })
  })
})
