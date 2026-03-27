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

---

## Spec-Review — 2026-03-27

### PASS gates

- AC2 GitHubAdapter wraps `gh` CLI — PASS
- AC3 No hardcoded `github.com` — `baseUrl` = `config.ghHost ?? GH_HOST ?? 'github.com'` — PASS
- AC4 `createAdapter` factory — reads `config.type`, throws for unknown — PASS
- AC5 Unit tests with mocked `gh` calls — 38/38 pass — PASS
- AC6 GHE URLs via `GH_HOST` env or `ghHost` constructor param — PASS
- LOC threshold — `adapter.ts` 115, `adapter-github.ts` 252, both under 300 — PASS

### FAIL gates — interface shape deviates from TASK_SPEC.md spec

**Missing methods (AC1):**

- [review] `getPrComments(number, since?)` absent from interface and GitHubAdapter — TASK_SPEC.md requires it
- [review] `getPrReviews(number)` absent from interface and GitHubAdapter — TASK_SPEC.md requires it

**Signature mismatches (AC1):**

- [review] `createIssue` returns `number`; spec requires `Promise<{ number: number; url: string }>`
- [review] `closeIssue(issueNumber)` drops `reason: string` parameter required by spec
- [review] `listIssues` renamed to `queryIssues`; spec names it `listIssues`
- [review] `getIssueComments(number, since?)` renamed to `listComments(issueNumber)` — `since` param dropped
- [review] `ensureLabelsExist(labels: string[])` renamed to `ensureLabelExists(label: string, opts?)` — spec requires plural form taking an array
- [review] `getPrStatus` return type: spec `{ state, mergeable, checks[] }`, impl `{ mergeable: boolean, mergeStateStatus: string }` — missing `state` field and `checks` array
- [review] `updateIssue` opts: spec requires `labelsAdd?` and `labelsRemove?` fields; impl has neither

**Required fix:** Reconcile `OrchestratorAdapter` interface in `adapter.ts` with TASK_SPEC.md spec shape, then add missing method implementations to `GitHubAdapter` and corresponding tests.
