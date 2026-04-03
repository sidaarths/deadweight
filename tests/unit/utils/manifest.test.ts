import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { assertAllowedManifestPath, readManifestInput } from '../../../src/utils/manifest.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(tmpdir(), `dw-manifest-test-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  // Scope the allowed root to tmpDir so tests work on all platforms
  // (tmpdir() may be outside homedir() on Linux/Mac CI).
  process.env['DEADWEIGHT_ROOT'] = tmpDir
})

afterEach(async () => {
  delete process.env['DEADWEIGHT_ROOT']
  await rm(tmpDir, { recursive: true, force: true })
})

describe('assertAllowedManifestPath', () => {
  it('returns resolved absolute path for package.json', () => {
    const result = assertAllowedManifestPath(join(tmpDir, 'package.json'))
    expect(result).toBe(resolve(tmpDir, 'package.json'))
  })

  it('accepts package-lock.json', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'package-lock.json'))).not.toThrow()
  })

  it('accepts .csproj files (variable prefix)', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'MyApp.csproj'))).not.toThrow()
  })

  it('accepts Cargo.toml', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'Cargo.toml'))).not.toThrow()
  })

  it('accepts go.mod', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'go.mod'))).not.toThrow()
  })

  it('accepts pom.xml', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'pom.xml'))).not.toThrow()
  })

  it('accepts requirements.txt', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'requirements.txt'))).not.toThrow()
  })

  it('throws on path traversal sequences (..)', () => {
    expect(() => assertAllowedManifestPath('../../../etc/passwd')).toThrow(/traversal/)
  })

  it('throws on disallowed filename (.env)', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, '.env'))).toThrow(/known manifest/)
  })

  it('throws on disallowed filename (secrets.json)', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'secrets.json'))).toThrow(/known manifest/)
  })

  it('throws on arbitrary text file', () => {
    expect(() => assertAllowedManifestPath(join(tmpDir, 'README.txt'))).toThrow(/known manifest/)
  })

  it('throws when path is outside the allowed root', () => {
    // homedir() is outside tmpDir (our DEADWEIGHT_ROOT), so a path under it should be rejected
    const outsidePath = join(homedir(), 'package.json')
    expect(() => assertAllowedManifestPath(outsidePath)).toThrow(/must be within/)
  })

  it('accepts paths in subdirectories of the allowed root', () => {
    const subDir = join(tmpDir, 'subproject')
    expect(() => assertAllowedManifestPath(join(subDir, 'package.json'))).not.toThrow()
  })
})

describe('readManifestInput', () => {
  it('returns content and undefined filePath when given content', async () => {
    const result = await readManifestInput({ content: '{"name":"test"}' })
    expect(result.content).toBe('{"name":"test"}')
    expect(result.filePath).toBeUndefined()
  })

  it('reads file and returns content + resolved filePath when given path', async () => {
    const lockfilePath = join(tmpDir, 'package.json')
    await writeFile(lockfilePath, '{"name":"my-app"}', 'utf-8')

    const result = await readManifestInput({ path: lockfilePath })
    expect(result.content).toBe('{"name":"my-app"}')
    expect(result.filePath).toBe(resolve(lockfilePath))
  })

  it('throws when path points to a non-existent file', async () => {
    await expect(
      readManifestInput({ path: join(tmpDir, 'nonexistent.json') }),
    ).rejects.toThrow()
  })

  it('throws when path contains traversal sequences', async () => {
    await expect(
      readManifestInput({ path: '../../../etc/passwd' }),
    ).rejects.toThrow(/traversal/)
  })

  it('throws when filename is not a known manifest', async () => {
    const badPath = join(tmpDir, 'config.yaml')
    await writeFile(badPath, 'key: value', 'utf-8')
    await expect(readManifestInput({ path: badPath })).rejects.toThrow(/known manifest/)
  })

  it('throws when file exceeds 10 MB size limit', async () => {
    const bigPath = join(tmpDir, 'package.json')
    // Write 11 MB of data
    const chunk = 'x'.repeat(1024)
    let content = ''
    for (let i = 0; i < 11 * 1024; i++) content += chunk
    await writeFile(bigPath, content, 'utf-8')

    await expect(readManifestInput({ path: bigPath })).rejects.toThrow(/10 MB/)
  })

  it('throws when path is outside the allowed root', async () => {
    await expect(
      readManifestInput({ path: join(homedir(), 'package.json') }),
    ).rejects.toThrow(/must be within/)
  })
})
