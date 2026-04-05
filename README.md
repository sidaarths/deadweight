# deadweight

**npm audit finds CVEs. deadweight finds everything else.**

deadweight is an MCP server that analyzes dependency trees across multiple ecosystems and surfaces maintainability risk: abandoned packages, single-maintainer bus-factor, license conflicts, and consolidation opportunities.

## Installation

```bash
npm install -g deadweight
```

Or run without installing:

```bash
npx deadweight
```

**Requires Node.js ≥ 20.**

## Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deadweight": {
      "command": "npx",
      "args": ["deadweight"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## MCP Tools

<!-- AUTO-GENERATED -->
| Tool | Description |
|------|-------------|
| `analyze_dependency_tree` | Resolve the full transitive dependency tree from a manifest file. Returns a structured package graph with metadata for every node. Call this first before using other tools. |
| `find_single_maintainer_dependencies` | Find dependencies that have only a single maintainer. Single-maintainer packages are a bus-factor risk — if the maintainer becomes unavailable the package may go unmaintained. |
| `flag_abandoned_dependencies` | Detect abandoned or unmaintained dependencies via publish date, repository activity, and CVE signals. Returns packages with an abandonment risk score and severity. |
| `get_transitive_license_conflicts` | Walk the full transitive dependency tree and detect license incompatibilities. Flags GPL/AGPL copyleft packages in proprietary projects, non-commercial restrictions, and GPL-2.0/GPL-3.0 mixing. |
| `suggest_consolidations` | Find packages that solve the same problem (e.g. multiple HTTP clients, date libraries) and suggest consolidating to a single well-maintained option to reduce bundle size and maintenance burden. |
| `get_dependency_health_report` | Synthesize all risk signals (maintainer, abandonment, license, consolidation) into a prioritized health report. Returns critical/warning/advisory groups, a 0-100 risk score, and top actions to reduce risk. |
| `compare_alternative` | Score alternatives to a package by weekly downloads, maintainer count, recency, and compatibility. Returns up to 5 ranked alternatives. No manifest file needed. |
| `get_ecosystem_summary` | High-level dashboard for a dependency tree: total package counts, risk score distribution, and the top 3 immediate actions to reduce risk. |
<!-- END AUTO-GENERATED -->

### Typical workflow

```
1. analyze_dependency_tree  →  resolve the graph
2. get_dependency_health_report  →  full risk synthesis
3. compare_alternative  →  evaluate a swap for a flagged package
```

## Supported Ecosystems

<!-- AUTO-GENERATED -->
| Ecosystem | Manifest Files |
|-----------|---------------|
| Node.js | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb` |
| Python | `requirements.txt`, `pyproject.toml`, `Pipfile`, `Pipfile.lock` |
| Rust | `Cargo.toml`, `Cargo.lock` |
| Go | `go.mod`, `go.sum` |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| .NET | `packages.config`, `Directory.Packages.props`, `*.csproj` |
<!-- END AUTO-GENERATED -->

## Environment Variables

<!-- AUTO-GENERATED -->
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Recommended | — | Personal access token for GitHub API health signals (last commit, archived status, open issues). No scopes needed for public repos. Get one at github.com/settings/tokens. |
| `LIBRARIES_IO_API_KEY` | No | — | API key for libraries.io SourceRank and dependent counts. Get a free key at libraries.io/api. |
| `DEADWEIGHT_CACHE_DIR` | No | `~/.deadweight/cache` | Directory for SQLite response cache. |
| `DEADWEIGHT_CACHE_TTL` | No | `3600` | Cache TTL in seconds. |
| `DEADWEIGHT_RATE_LIMIT` | No | `10` | Maximum requests per second per registry. |
<!-- END AUTO-GENERATED -->

## Scripts

<!-- AUTO-GENERATED -->
| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` with tsup |
| `npm run dev` | Watch mode build |
| `npm test` | Run full test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with v8 coverage report |
| `npm run test:integration` | Run integration tests only |
| `npm run prepublishOnly` | Build + test (runs automatically before `npm publish`) |
<!-- END AUTO-GENERATED -->

## Limitations

- **Gradle**: dependency resolution is regex-based (no Gradle daemon). `build.gradle` files with dynamic versions (`latest.release`, version catalogs) may resolve incompletely. For best results, commit a lockfile (`gradle.lockfile`).
- **GitHub signals** (`find_single_maintainer_dependencies`, `flag_abandoned_dependencies`, `get_dependency_health_report`) require `GITHUB_TOKEN`. Without it, contributor count and archived status are unavailable and scores are calculated from publish date and CVE data only.
- **CVE data** is sourced from the OSV database (osv.dev). Only published, indexed vulnerabilities are returned.
- **`compare_alternative`** currently supports Node.js packages only (npm registry).

## License

MIT
