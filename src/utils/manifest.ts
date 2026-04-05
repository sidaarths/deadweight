import { readFile, stat } from 'node:fs/promises'
import { resolve, basename, sep } from 'node:path'
import { homedir } from 'node:os'

const ALLOWED_MANIFEST_NAMES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock',
  'go.mod', 'go.sum',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'packages.config', 'Directory.Packages.props',
])

// Maximum size for manifest files read from disk (matches the inline content cap)
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

// Reads are bounded to paths under this root. Defaults to the user's home directory
// so tools can analyze projects anywhere under ~/. Set DEADWEIGHT_ROOT to restrict further.
function getAllowedRoot(): string {
  const configured = process.env['DEADWEIGHT_ROOT']
  if (configured) return resolve(configured)
  return homedir()
}

export function assertAllowedManifestPath(rawPath: string): string {
  if (rawPath.includes('..')) {
    throw new Error('Path must not contain directory traversal sequences')
  }
  const resolved = resolve(rawPath)
  const allowedRoot = getAllowedRoot()

  // Ensure the resolved path is within the allowed root directory.
  // We check both `root + sep + ...` and exact equality to handle the root itself.
  if (!resolved.startsWith(allowedRoot + sep) && resolved !== allowedRoot) {
    throw new Error(
      `Path must be within ${allowedRoot}. Set DEADWEIGHT_ROOT to adjust this boundary.`,
    )
  }

  const name = basename(resolved)
  const isCsproj = name.endsWith('.csproj')
  if (!ALLOWED_MANIFEST_NAMES.has(name) && !isCsproj) {
    throw new Error(
      `Path must point to a known manifest file (e.g. package.json, requirements.txt). Got: ${name}`,
    )
  }
  return resolved
}

interface ManifestContent {
  content: string
  filePath: string | undefined
}

export async function readManifestInput(
  input: { path?: string; content?: string },
): Promise<ManifestContent> {
  if (input.path) {
    const resolvedPath = assertAllowedManifestPath(input.path)
    const { size } = await stat(resolvedPath)
    if (size > MAX_FILE_BYTES) {
      throw new Error(
        `Manifest file exceeds 10 MB limit (${size} bytes): ${basename(resolvedPath)}`,
      )
    }
    const content = await readFile(resolvedPath, 'utf-8')
    return { content, filePath: resolvedPath }
  }
  if (!input.content) throw new Error('Either path or content must be provided')
  return { content: input.content, filePath: undefined }
}
