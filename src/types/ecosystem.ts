export enum Ecosystem {
  nodejs = 'nodejs',
  python = 'python',
  dotnet = 'dotnet',
  rust = 'rust',
  golang = 'golang',
  java = 'java',
}

export type ManifestType =
  | 'package.json' | 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml'
  | 'requirements.txt' | 'pyproject.toml' | 'Pipfile' | 'Pipfile.lock'
  | 'csproj' | 'packages.config' | 'Directory.Packages.props'
  | 'Cargo.toml' | 'Cargo.lock'
  | 'go.mod' | 'go.sum'
  | 'pom.xml' | 'build.gradle' | 'build.gradle.kts'

export const ECOSYSTEM_MANIFEST_MAP: Record<Ecosystem, ManifestType[]> = {
  [Ecosystem.nodejs]: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
  [Ecosystem.python]: ['requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock'],
  [Ecosystem.dotnet]: ['csproj', 'packages.config', 'Directory.Packages.props'],
  [Ecosystem.rust]: ['Cargo.toml', 'Cargo.lock'],
  [Ecosystem.golang]: ['go.mod', 'go.sum'],
  [Ecosystem.java]: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
}
