import { basename, extname } from 'node:path'
import { Ecosystem } from '../types/index.js'

const PATH_MAP: Record<string, Ecosystem> = {
  'package.json': Ecosystem.nodejs,
  'package-lock.json': Ecosystem.nodejs,
  'yarn.lock': Ecosystem.nodejs,
  'pnpm-lock.yaml': Ecosystem.nodejs,
  'requirements.txt': Ecosystem.python,
  'pyproject.toml': Ecosystem.python,
  'Pipfile': Ecosystem.python,
  'Pipfile.lock': Ecosystem.python,
  'Cargo.toml': Ecosystem.rust,
  'Cargo.lock': Ecosystem.rust,
  'go.mod': Ecosystem.golang,
  'go.sum': Ecosystem.golang,
  'pom.xml': Ecosystem.java,
  'build.gradle': Ecosystem.java,
  'build.gradle.kts': Ecosystem.java,
  'packages.config': Ecosystem.dotnet,
  'Directory.Packages.props': Ecosystem.dotnet,
}

export function detectEcosystem(filePath?: string, content?: string): Ecosystem | null {
  if (filePath) {
    const name = basename(filePath)
    if (PATH_MAP[name]) return PATH_MAP[name]
    // .csproj files have variable prefixes
    if (extname(name) === '.csproj') return Ecosystem.dotnet
  }

  if (content) {
    // JSON with a "dependencies" or "lockfileVersion" key → Node.js
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object') {
        if ('dependencies' in parsed || 'lockfileVersion' in parsed || 'devDependencies' in parsed) {
          return Ecosystem.nodejs
        }
      }
    } catch {
      // not JSON — continue to other heuristics
    }
    // requirements.txt: lines like "package==version" or "package>=version"
    // Require the more specific PEP 440 operators (== >= <= ~= !=) and that
    // the match is at the start of a line with no JS/CSS-like prefix chars.
    // Single < or > without = is excluded to avoid matching HTML/CSS.
    if (/^[a-zA-Z0-9]([a-zA-Z0-9._-]*)?(\[[\w,\s]+\])?\s*(==|>=|<=|~=|!=)/m.test(content)) {
      return Ecosystem.python
    }
  }

  return null
}
