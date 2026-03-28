# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Spec: SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern"

Acceptance criteria:
- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls
- [ ] `orchestrate.ts` uses adapter interface, not raw `execGh`
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`)
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches (deferred per spec "Approach")
- [ ] All GitHub URL construction derives from adapter, never hardcoded (satisfied when #3 is done)

---

## Current Phase: Migration

### QA Bugs

- [x] [qa/P1] QA environment Bash tool non-functional: All shell commands return exit code 1 or 134 with no output → TypeScript build, unit test suite, and CLI binary install could not be executed → QA of compiled artifacts is blocked until env is fixed. Tested at 2026-03-27. RESOLVED: Bash functional in 2026-03-28 session.

- [x] [qa/P1] process-requests.ts missing exported functions/types: commit d49686908 deleted `formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches` (functions), `ChildBranchSyncDeps`, `SyncMasterToTrunkDeps` (interfaces), and re-exports of `processCrResultFiles`/`CrResultDeps` from `process-requests.ts` → `process-requests.test.ts` fails entirely at import because the 5 named function exports are gone → restore all removed exports (test imports `processCrResultFiles`/`CrResultDeps` from `cr-pipeline.js` directly, but the re-exports are also needed for production callers). Restored at 2026-03-28. All 14 tests pass.

- [ ] [qa/P1] orchestrate.ts missing label enrichment code: commit d49686908 removed `deriveComponentLabels` import and `wave/N` label alongside `aloop/wave-N` in `applyDecompositionPlan` → 15 additional test failures in orchestrate.test.ts (54 failing vs 39 at merge base) → Spec requires issue creation to include `wave/N` label; removing it breaks label conventions — restore the deleted label code. Tested at 2026-03-28, commit 257a6f268. (priority: high)

### In Progress

- [ ] [review] Gate 5: `process-requests.ts:551` — `issue.state !== 'review'` is a dead comparison because `OrchestratorIssueState` is `'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed'` with no `'review'` member — TypeScript error TS2367; either add `'review'` to `OrchestratorIssueState` in orchestrate.ts (if this is a real state), or remove the `!== 'review'` clause if it is not valid; this was part of the qa/P1 for process-requests.ts but was not fixed when exports were restored at commit 82ffc2a71 (priority: high)

- [x] [review] Gate 2: `updateIssue` in `adapter.ts:77-96` has zero test coverage despite a multi-step implementation (body edit, labels_add, labels_remove, state transitions each make separate `gh` calls) — add tests for: body-only update (assert `--body` arg), `labels_add` path (assert two `--add-label` calls for two labels), `labels_remove` path (assert `--remove-label`), `state: 'closed'` (assert `issue close` called), `state: 'open'` (assert `issue reopen` called), and combined update with body + labels_add + state (priority: high)

- [x] [review] Gate 2/3: `listComments` `since` filter branch (adapter.ts:233-235) is untested — add a test that passes a `since` timestamp and asserts only comments after that date are returned, and a test with all-old comments returning empty array (priority: medium)

- [x] [review] Gate 1: `OrchestratorAdapter` interface in `adapter.ts` deviates from spec's method names and return types — `queryIssues` must be renamed to `listIssues` (spec line ~988); `createPr`/`mergePr`/`getPrStatus` must be `createPR`/`mergePR`/`getPRStatus` (spec convention); `createIssue` must return `{ number: number; url: string }` not bare `number` (spec line ~983); `getPRStatus` must return `{ mergeable, ci_status: 'success'|'failure'|'pending', reviews: Array<{ verdict: string }> }` not `{ mergeable, mergeStateStatus }` (spec line ~997); `updateIssue` must accept `labels_add` and `labels_remove` fields (spec line ~985) — fix the interface and implementation in `src/lib/adapter.ts` and update all call sites and tests accordingly (priority: high)

- [x] [review] Gate 2: ~~No tests for adapter instantiation branches~~ — adapter instantiation code removed pending re-implementation; gate no longer applicable

- [x] [review] Gate 4: ~~execGh fallback breaks DI~~ — adapter instantiation code removed pending re-implementation; gate no longer applicable

### Up Next

- [ ] Re-add adapter field to deps interfaces (`TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps`) and thread `deps.adapter` through child deps in `orchestrateCommandWithDeps`

- [ ] Re-add adapter instantiation in `orchestrateCommandWithDeps` — create adapter when `filterRepo` is provided, using static import of `node:child_process` and requiring `deps.execGh` (no silent fallback)

- [ ] Migrate issue lifecycle calls in orchestrate.ts (TriageDeps / triage functions) — replace `deps.execGh(['issue', ...])` with `adapter.closeIssue()`, `adapter.addLabels()`, `adapter.removeLabels()`, `adapter.postComment()`, `adapter.listIssues()`, and `adapter.updateIssue()` in triage functions; replace `deps.execGhIssueCreate` with `adapter.createIssue()` in dispatch

- [ ] Migrate PR lifecycle calls in orchestrate.ts (PrLifecycleDeps) — replace `deps.execGh` calls in PR creation/merge/status functions with `adapter.createPR()`, `adapter.mergePR()`, `adapter.getPRStatus()`

- [ ] Migrate scanLoop / bulk fetch execGh calls in orchestrate.ts — replace `deps.execGh` calls in bulk fetch, issue close, and auto-merge with adapter calls

- [ ] Migrate process-requests.ts execGh calls — replace `execGh` usage with adapter calls; thread adapter through deps

- [ ] Meta.json adapter config — read `adapter` field from `meta.json` (default: `"github"`) and pass the type to `createAdapter()` instead of hardcoding `"github"`

### Deferred

- [ ] LocalAdapter implementation — file-based adapter storing issues as JSON in `.aloop/issues/`, PRs as branches; deferred per spec: "implement local adapter when there's demand"

### Completed

- [x] `OrchestratorAdapter` interface aligned with spec (positional params, correct return types)
- [x] `GitHubAdapter` implementation wrapping `gh` CLI calls
- [x] `adapter.test.ts` with unit tests for `GitHubAdapter`
- [x] Interface method names match spec: `listIssues`, `createPR`, `mergePR`, `getPRStatus`
- [x] `createIssue` returns `{ number, url }` per spec
- [x] `updateIssue` accepts `labels_add` / `labels_remove` per spec
- [x] `getPRStatus` returns `{ mergeable, ci_status, reviews }` per spec
