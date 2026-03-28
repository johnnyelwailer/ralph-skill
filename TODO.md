# Issue #176: OrchestratorAdapter interface and GitHubAdapter implementation

## Current Phase: Fixing spec deviations

### In Progress

- [x] Reconcile `OrchestratorAdapter` interface in `adapter.ts` with TASK_SPEC.md (priority: critical)
  - Renamed `queryIssues` → `listIssues`
  - Renamed `listComments` → `getIssueComments`; added `since?` param
  - Fixed `createIssue`: positional `(title, body, labels[])` → returns `Promise<{ number: number; url: string }>`
  - Fixed `closeIssue`: added `reason: string` parameter
  - Fixed `updateIssue` opts: added `labelsAdd?: string[]` and `labelsRemove?: string[]`
  - Fixed `mergePr`: positional `strategy` param instead of opts object
  - Fixed `getPrStatus` return type: `{ state: string; mergeable: boolean; checks: Array<{name, status, conclusion}> }`
  - Renamed `ensureLabelExists` → `ensureLabelsExist(labels: string[])`
  - Added `getPrComments(number: number, since?: string)` method
  - Added `getPrReviews(number: number)` method
  - Added optional `syncProjectStatus?(issueNumber, status)` method
  - Added `AdapterReview` type

- [x] Update `GitHubAdapter` in `adapter-github.ts` to implement corrected interface (priority: critical)
  - Updated all method signatures to match the corrected interface
  - Implemented `getPrComments` using `gh api repos/{repo}/issues/{pr}/comments`
  - Implemented `getPrReviews` using `gh api repos/{repo}/pulls/{pr}/reviews`
  - Updated `ensureLabelsExist` to accept `labels: string[]` and iterate
  - Updated `getPrStatus` to fetch and return `state`, `mergeable`, and `checks[]`
  - Updated `updateIssue` to handle `labelsAdd`/`labelsRemove` via `addLabels`/`removeLabels`

- [x] Update tests in `adapter.test.ts` to cover corrected interface (priority: critical)
  - Fixed test names/assertions for renamed/reshaped methods
  - Added tests for `getPrComments` (with and without `since`)
  - Added tests for `getPrReviews`
  - Added tests for `ensureLabelsExist` with array input
  - Added tests for `updateIssue` with `labelsAdd`/`labelsRemove`
  - Added tests for corrected `getPrStatus` return shape (state + checks[])
  - Added test for `closeIssue` with reason → `--comment` flag

### Up Next

- [x] Rebuild dist artifacts after interface fixes (`dist/index.js`, dashboard, templates)

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

## QA Bugs — iter 9 (2026-03-27)

QA verified all interface deviations at HEAD (b6e32bf40). The following are filed as high-priority bugs blocking spec compliance:

- [ ] [qa/P1] Missing `getPrComments`: `getPrComments(number, since?)` absent from `OrchestratorAdapter` interface and `GitHubAdapter` — spec AC1 requires it. Tested iter 9. (priority: high)
- [ ] [qa/P1] Missing `getPrReviews`: `getPrReviews(number)` absent from `OrchestratorAdapter` interface and `GitHubAdapter` — spec AC1 requires it. Tested iter 9. (priority: high)
- [ ] [qa/P1] Wrong method name `queryIssues` vs `listIssues`: interface exports `queryIssues` but TASK_SPEC.md requires `listIssues`. Confirmed via test name "queryIssues" in adapter.test.ts. Tested iter 9. (priority: high)
- [ ] [qa/P1] Wrong method name `listComments` vs `getIssueComments`: interface exports `listComments(issueNumber)` but spec requires `getIssueComments(number, since?)` — also drops `since` parameter. Tested iter 9. (priority: high)
- [ ] [qa/P1] Wrong method name `ensureLabelExists` vs `ensureLabelsExist`: interface exports `ensureLabelExists(label, opts?)` (singular) but spec requires `ensureLabelsExist(labels: string[])` (plural, array). Tested iter 9. (priority: high)
- [ ] [qa/P1] `createIssue` wrong return type: returns bare `number`, spec requires `Promise<{ number: number; url: string }>`. Test name confirms "returns the number" only. Tested iter 9. (priority: high)
- [ ] [qa/P1] `closeIssue` missing `reason` parameter: interface drops `reason: string` — spec requires `closeIssue(number, reason: string)`. Tested iter 9. (priority: high)
- [ ] [qa/P1] `getPrStatus` incomplete return type: returns `{ mergeable, mergeStateStatus }` but spec requires `{ state, mergeable, checks[] }` — `state` field and `checks` array absent. Tested iter 9. (priority: high)
- [ ] [qa/P1] `updateIssue` opts missing `labelsAdd`/`labelsRemove`: no tests for label mutation via `updateIssue`; spec requires `{ labelsAdd?: string[]; labelsRemove?: string[] }` in opts. Tested iter 9. (priority: high)
