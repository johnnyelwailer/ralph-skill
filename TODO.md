# Issue #176: OrchestratorAdapter interface and GitHubAdapter implementation

## Current Phase: Complete

### Completed

- [x] Define `OrchestratorAdapter` interface in `aloop/cli/src/lib/adapter.ts`
- [x] Implement `GitHubAdapter` class in `aloop/cli/src/lib/adapter-github.ts` wrapping all `gh` CLI calls
- [x] `GitHubAdapter` derives `baseUrl` from `ghHost` config / `GH_HOST` env var — no hardcoded `github.com`
- [x] GitHub Enterprise URLs supported (`ghHost` constructor param or `GH_HOST` env)
- [x] `createAdapter` factory reads adapter type from config (default: `"github"`)
- [x] Unit tests in `adapter.test.ts` with mocked `gh` calls (38/38 pass)
- [x] Split `adapter.ts` (interface + factory, 115 LOC) from `adapter-github.ts` (implementation, 252 LOC) — both under 300 LOC threshold
- [x] Remove dead imports (`parseRepoSlug`, unused `existsSync`) from adapter files
- [x] Remove dead import of `createAdapter`/`OrchestratorAdapter` from `orchestrate.ts` and `process-requests.ts`
- [x] Rebuild dist artifacts (`dist/index.js` shebang, dashboard, templates)

### Out of Scope (explicitly excluded — tracked separately)

- [~] Migrate `orchestrate.ts` to use adapter interface instead of raw `execGh` — spec file scope is `adapter.ts` + `adapter.test.ts` only; orchestrate.ts migration is a follow-on PR
- [~] `LocalAdapter` (file-based backend) — not in this issue's spec
