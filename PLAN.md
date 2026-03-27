# deadweight — Implementation Plan

> **Tagline:** npm audit finds CVEs. deadweight finds everything else.

A TypeScript MCP server that analyzes full dependency trees across 6 ecosystems and surfaces maintainability risk, license conflicts, structural inefficiency, and abandonment signals.

---

## Technology Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict, ESM) |
| Runtime | Node.js 20+ |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Build | `tsup` |
| Test | `vitest` |
| HTTP | Native `fetch` + `p-limit` |
| Cache | `keyv` + `@keyv/sqlite` |
| Schema | `zod` |
| SPDX | `spdx-correct` + `spdx-satisfies` |

---

## Supported Ecosystems

| Ecosystem | Manifest Files | Registry |
|-----------|---------------|----------|
| Node.js | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | npm Registry API |
| Python | `requirements.txt`, `pyproject.toml`, `Pipfile.lock` | PyPI JSON API |
| .NET | `*.csproj`, `packages.config`, `Directory.Packages.props` | NuGet API v3 |
| Rust | `Cargo.toml`, `Cargo.lock` | crates.io API |
| Go | `go.mod`, `go.sum` | proxy.golang.org + pkg.go.dev |
| Java | `pom.xml`, `build.gradle` | Maven Central |

---

## MCP Tools (8 total)

| Tool | Description |
|------|-------------|
| `analyze_dependency_tree` | Resolve full transitive tree from a manifest file. Foundation for all other tools. |
| `find_single_maintainer_dependencies` | Flag packages with a single maintainer who hasn't been active recently. |
| `flag_abandoned_dependencies` | Detect quietly rotting packages via publish date, repo commits, issue health, CVE signals. |
| `get_transitive_license_conflicts` | Walk the full tree, map SPDX licenses, detect incompatibilities (GPL/AGPL/non-commercial). |
| `suggest_consolidations` | Find packages solving the same problem (HTTP clients, date libs, etc.) and recommend consolidation. |
| `get_dependency_health_report` | Synthesize all signals into a prioritized report: fix these 4 things to eliminate 75% of risk. |
| `compare_alternative` | Score alternatives to a risky package by downloads, maintainers, recency, compatibility. |
| `get_ecosystem_summary` | High-level dashboard: total deps, risk score distribution, top 3 immediate actions. |

---

## Data Sources

| Source | Used For | Auth |
|--------|----------|------|
| npm Registry API | Node.js metadata, maintainers, versions | None |
| PyPI JSON API | Python metadata, maintainers | None |
| NuGet API v3 | .NET metadata, owners, versions | None |
| crates.io API | Rust metadata, owners | User-Agent required |
| proxy.golang.org + pkg.go.dev | Go module metadata | None |
| Maven Central | Java metadata | None |
| GitHub API | Last commit, contributors, archived status, open issues | Token (free tier) |
| OSV API | Vulnerability data across all ecosystems | None |
| SPDX License List | License compatibility matrix | Static bundled |
| libraries.io API | SourceRank, dependent counts | API key (optional) |

---

## Project Structure

```
src/
  index.ts                    # Entry point (config, cache, server start)
  server.ts                   # MCP server setup + tool registration
  config.ts                   # Env var loading + Zod validation
  types/
    ecosystem.ts              # Ecosystem enum, ManifestType, ECOSYSTEM_MANIFEST_MAP
    package.ts                # Package, Maintainer, RegistryMetadata, DependencyNode, DependencyTree
    risk.ts                   # RiskSignal, RiskScore, RiskSeverity enum
    license.ts                # LicenseInfo, LicenseConflict, LicenseConflictType
    analysis.ts               # HealthReport, Consolidation, Alternative, EcosystemSummary
    tool-schemas.ts           # Zod schemas + inferred types for all 8 tool inputs
  parsers/
    base.ts                   # ManifestParser interface → ParsedManifest
    detect.ts                 # Auto-detect Ecosystem from file path or content
    nodejs/parser.ts          # package.json + package-lock.json v2/v3
    python/parser.ts          # requirements.txt, pyproject.toml, Pipfile.lock
    dotnet/parser.ts          # .csproj XML, packages.config, Directory.Packages.props
    rust/parser.ts            # Cargo.toml, Cargo.lock (TOML)
    golang/parser.ts          # go.mod (line-based)
    java/parser.ts            # pom.xml XML + basic Gradle regex
  registry/
    base.ts                   # RegistryClient interface
    http.ts                   # fetch + p-limit + retry (3x, exponential) + 10s timeout + cache
    cache.ts                  # Keyv + SQLite, keyed {registry}:{package}:{version?}
    npm.ts                    # npm registry client
    pypi.ts                   # PyPI registry client
    nuget.ts                  # NuGet v3 client (service index → resource URLs)
    crates.ts                 # crates.io client (User-Agent required)
    golang.ts                 # proxy.golang.org client
    maven.ts                  # Maven Central search client
    github.ts                 # Repo health: last commit, issues, archived, contributors
    osv.ts                    # OSV /v1/query vulnerability lookup
    librariesio.ts            # SourceRank + dependent counts (graceful degradation)
  analysis/
    tree-resolver.ts          # detect → parse → enrich with registry metadata → DependencyTree
    maintainer-risk.ts        # Single-maintainer + activity + downstream dependents → RiskSignal[]
    abandonment.ts            # last publish + last commit + issue ratio + CVEs → 0-100 score
    license-checker.ts        # Walk tree, normalize SPDX, return conflict graph
    consolidation.ts          # Group by functional category, flag duplicates, estimate savings
    health-report.ts          # Aggregate all RiskSignal[], dedup, sort, group Critical/Warning/Advisory
    alternative-finder.ts     # Category lookup + registry search + score top 5 alternatives
    ecosystem-summary.ts      # Dashboard aggregation
    categories.ts             # Curated functional category taxonomy per ecosystem
    spdx-compat.ts            # Static SPDX compatibility matrix (GPL-3.0, AGPL-3.0, non-commercial)
  tools/
    analyze-dependency-tree.ts
    find-single-maintainer.ts
    flag-abandoned.ts
    get-license-conflicts.ts
    suggest-consolidations.ts
    get-health-report.ts
    compare-alternative.ts
    get-ecosystem-summary.ts
  utils/
    semver.ts                 # Version range utilities
    fs.ts                     # File reading helpers
    scoring.ts                # Weighted scoring utilities
tests/
  fixtures/{nodejs,python,dotnet,rust,golang,java}/
  unit/{parsers,registry,analysis,types}/
  integration/tools/
```

---

## Phases

### Phase 1 — Project Scaffolding + Core Types ✅
**Branch:** `phase-1/scaffolding-core-types` | **PR:** #1

- `package.json` with all deps
- `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- All types: `Ecosystem`, `Package`, `DependencyTree`, `RiskSignal`, `LicenseConflict`, `HealthReport`, `Alternative`, `EcosystemSummary`
- Zod schemas for all 8 tool inputs
- 29 tests, all passing

---

### Phase 2 — HTTP Layer, Caching, Config ✅
**Branch:** `phase-2/http-cache-config` | **PR:** #2

Files: `src/config.ts`, `src/registry/cache.ts`, `src/registry/http.ts`, `src/registry/base.ts`

Steps:
1. `config.ts` — load `GITHUB_TOKEN`, `LIBRARIES_IO_API_KEY`, `DEADWEIGHT_CACHE_DIR` (default `~/.deadweight/cache`), `DEADWEIGHT_CACHE_TTL` (default 3600s), `DEADWEIGHT_RATE_LIMIT` (default 10 req/s) via Zod
2. `cache.ts` — Keyv + SQLite, `get<T>()`, `set<T>()`, `clear()`
3. `http.ts` — native `fetch` + `p-limit` + exponential backoff retry + 10s timeout + cache integration. Exposes `fetchJson<T>(url, options?)`
4. `base.ts` — `RegistryClient` interface: `getPackageMetadata()`, `getPackageMaintainers()`, `getDownloadCount()`
5. Tests: retry behavior, cache hit/miss, rate limiting (mocked fetch)

**Deliverable:** Reliable shared HTTP infrastructure.

---

### Phase 3 — Node.js End-to-End + Tool 1 ✅
**Branch:** `phase-3/nodejs-e2e` | **PR:** #4

Files: `src/parsers/detect.ts`, `src/parsers/base.ts`, `src/parsers/nodejs/parser.ts`, `src/registry/npm.ts`, `src/analysis/tree-resolver.ts`, `src/server.ts`, `src/index.ts`, `src/tools/analyze-dependency-tree.ts`

Steps:
1. `detect.ts` — auto-detect ecosystem from filename/content heuristics
2. `parsers/base.ts` — `ManifestParser` interface returning `ParsedManifest`
3. `parsers/nodejs/parser.ts` — parse `package.json` + `package-lock.json` v2/v3
4. `registry/npm.ts` — abbreviated metadata endpoint, maintainers, download counts
5. `analysis/tree-resolver.ts` — detect → parse → enrich → `DependencyTree`
6. `server.ts` — MCP server, stdio transport, tool registration pattern
7. `src/index.ts` — entry point: load config, init cache, start server
8. `tools/analyze-dependency-tree.ts` — Tool 1: accepts `{ path?, content?, includeDevDependencies? }`
9. Fixtures + integration tests (186 tests, 99% statement coverage)

**Deliverable:** `deadweight` pointable at a Node.js project in Claude Desktop.

---

### Phase 4 — Analysis Engines
**Branch:** `phase-4/analysis-engines`

Files: `src/registry/{github,osv,librariesio}.ts`, `src/analysis/{maintainer-risk,abandonment,spdx-compat,license-checker,categories,consolidation,health-report,alternative-finder}.ts`

Steps:
1. `registry/github.ts` — last commit, open issues, contributor count, archived status
2. `registry/osv.ts` — `POST /v1/query` to look up CVEs
3. `registry/librariesio.ts` — SourceRank + dependent counts (graceful degradation without key)
4. `analysis/maintainer-risk.ts` — single maintainer + inactivity + downstream dependents → `RiskSignal[]`
5. `analysis/abandonment.ts` — last publish (>2yr=warning, >4yr=critical) + commit + issue ratio + CVEs → 0-100 score
6. `analysis/spdx-compat.ts` — static matrix: GPL-3.0, AGPL-3.0, non-commercial, dual-license rules
7. `analysis/license-checker.ts` — walk tree, normalize SPDX, return conflict graph
8. `analysis/categories.ts` — curated taxonomy: http-client, date-time, utility, testing, logger, etc.
9. `analysis/consolidation.ts` — group by category, flag duplicates, estimate size savings
10. `analysis/health-report.ts` — aggregate `RiskSignal[]`, dedup, sort by severity × impact, group into Critical/Warning/Advisory
11. `analysis/alternative-finder.ts` — category lookup + registry search → score top 5 by downloads/maintainers/recency/size
12. Unit tests for all engines with mocked registry data

**Deliverable:** All analysis logic working with Node.js data.

---

### Phase 5 — Remaining 7 MCP Tools
**Branch:** `phase-5/all-tools`

Files: `src/tools/{find-single-maintainer,flag-abandoned,get-license-conflicts,suggest-consolidations,get-health-report,compare-alternative,get-ecosystem-summary}.ts`

- Tool 2: `find_single_maintainer_dependencies`
- Tool 3: `flag_abandoned_dependencies`
- Tool 4: `get_transitive_license_conflicts`
- Tool 5: `suggest_consolidations`
- Tool 6: `get_dependency_health_report`
- Tool 7: `compare_alternative` — accepts `{ packageName, ecosystem }`, no manifest needed
- Tool 8: `get_ecosystem_summary`
- Integration tests for all tools with fixtures + mocked HTTP

**Deliverable:** All 8 tools working for Node.js. Feature-complete for one ecosystem.

---

### Phase 6 — Python Ecosystem
**Branch:** `phase-6/python-ecosystem`

Files: `src/parsers/python/parser.ts`, `src/registry/pypi.ts`

- Parse `requirements.txt` (line-by-line, `-r` includes, version specifiers), `pyproject.toml` (TOML `[project.dependencies]`), `Pipfile.lock` (JSON)
- PyPI JSON API: versions, license, author, last upload, `requires_dist`
- Update `detect.ts` for Python filenames
- Update `tree-resolver.ts` with Python branch
- Fixtures + tests for all manifest formats

**Note:** PyPI has limited maintainer data — supplement with GitHub signals.

**Deliverable:** All 8 tools work for Python projects.

---

### Phase 7 — Remaining 4 Ecosystems
**Branch:** `phase-7/remaining-ecosystems`

Files: parsers + registry clients for Rust, Go, .NET, Java

- **Rust:** `Cargo.lock` TOML + crates.io API (User-Agent required)
- **Go:** `go.mod` line-based + proxy.golang.org (handle `v2`/`v3` module path suffixes)
- **.NET:** XML `csproj`/`packages.config` + NuGet v3 (resolve service index first)
- **Java:** `pom.xml` XML + basic Gradle regex + Maven Central search

> **Gradle limitation:** Full Groovy/Kotlin parsing is out of scope — handles common `implementation`/`api` patterns only. Documented.

**Deliverable:** All 6 ecosystems supported.

---

### Phase 8 — Polish + Distribution
**Branch:** `phase-8/polish`

1. Error handling audit — structured errors, no raw stack traces
2. `README.md` — installation, Claude Desktop config snippet, tool descriptions, limitations
3. npm package config — `bin`, `files`, `engines`, `prepublishOnly`
4. `.claude-desktop-config.example.json` — copy-pasteable MCP server config

**Deliverable:** Publishable npm package, `npx deadweight` works.

---

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| npm rate limiting | High | Cache 1hr, abbreviated metadata endpoint, p-limit |
| GitHub 60 req/hr unauthenticated | High | Require token, graceful degradation without it |
| Lockfile format differences (npm v1/v2/v3) | Medium | Detect format version, support v2/v3 first |
| Transitive resolution accuracy without lockfile | Medium | Warn loudly, depth-limit to 10, recommend lockfile |
| License false positives | Medium | "Potential conflict" framing, explain reasoning |
| Gradle complexity | High | Regex only, documented limitation |
| Large trees (1000+ nodes) | Medium | Parallel fetches, 5-min timeout, progress reporting |
| PyPI limited maintainer data | Medium | Supplement with GitHub contributor data |

---

## Success Criteria

- [ ] `npx deadweight` starts an MCP server Claude Desktop connects to
- [ ] `analyze_dependency_tree` returns complete tree for a real `package.json` + lockfile
- [ ] `get_dependency_health_report` produces a prioritized, actionable report
- [ ] All 8 tools respond within 30s for ≤500 deps (warm cache)
- [ ] Node.js and Python fully working with all 8 tools
- [ ] .NET, Rust, Go, Java working for tree analysis + basic health signals
- [ ] 80%+ coverage on parsers and analysis engines
- [ ] Graceful degradation without GitHub token or libraries.io key
- [ ] Cache reduces repeat API calls by 90%+
