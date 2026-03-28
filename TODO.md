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

### In Progress

- [ ] [qa/P1] orchestrate.ts applyDecompositionPlan missing dependency body injection: `applyDecompositionPlan` does not inject "Depends on #X, #Y" references into sub-issue bodies when `depends_on` is set → orchestrate.test.ts suite 60 subtests 5-6 fail ("Second issue should reference Depends on #1", "Third issue should reference both dependencies") → tests passed at pre-regression baseline (298ac3309) but regressed via d49686908 adapter changes. Tested at 2026-03-28. (priority: high)

- [ ] [qa/P1] orchestrate.ts applyEstimateResults not applying complexity/priority labels via execGh: `applyEstimateResults` does not call execGh to add `complexity/M`, `complexity/L`, `complexity/S`, or `P1` labels after DoR passes → orchestrate.test.ts suite 61 subtests 1-4 fail; additionally TypeScript reports TS2353 in test file (`'priority' does not exist in type 'EstimateResult'`) suggesting EstimateResult type is also missing the `priority` field → tests passed at pre-regression baseline (298ac3309) but regressed via d49686908 adapter changes. Tested at 2026-03-28. (priority: high)

- [x] [qa/P1] orchestrate.ts missing label enrichment code: `applyDecompositionPlan` at line 659 only adds `['aloop', 'aloop/wave-${wave}']` — missing `wave/${wave}` label that tests at orchestrate.test.ts:652 and 6035-6123 assert — add `wave/${wave}` to the labels array alongside `aloop/wave-${wave}`; also restore the `deriveComponentLabels` import and usage if it was previously used to add component labels (priority: high)

- [x] [review] Gate 5: `process-requests.ts:551` — `issue.state !== 'review'` is a dead comparison because `OrchestratorIssueState` is `'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed'` with no `'review'` member — TypeScript error TS2367; add `'review'` to `OrchestratorIssueState` in orchestrate.ts (the check is used to sync child branches for issues in review state, so 'review' is a real state that should exist); this was part of the qa/P1 for process-requests.ts but was not fixed when exports were restored at commit 82ffc2a71 (priority: high)

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

### QA Bugs (Resolved)

- [x] [qa/P1] QA environment Bash tool non-functional: All shell commands return exit code 1 or 134 with no output → TypeScript build, unit test suite, and CLI binary install could not be executed → QA of compiled artifacts is blocked until env is fixed. Tested at 2026-03-27. RESOLVED: Bash functional in 2026-03-28 session.

- [x] [qa/P1] process-requests.ts missing exported functions/types: commit d49686908 deleted `formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches` (functions), `ChildBranchSyncDeps`, `SyncMasterToTrunkDeps` (interfaces), and re-exports of `processCrResultFiles`/`CrResultDeps` from `process-requests.ts` → `process-requests.test.ts` fails entirely at import because the 5 named function exports are gone → restore all removed exports (test imports `processCrResultFiles`/`CrResultDeps` from `cr-pipeline.js` directly, but the re-exports are also needed for production callers). Restored at 2026-03-28. All 14 tests pass.

### Completed

- [x] `OrchestratorAdapter` interface aligned with spec (positional params, correct return types)
- [x] `GitHubAdapter` implementation wrapping `gh` CLI calls
- [x] `adapter.test.ts` with unit tests for `GitHubAdapter`
- [x] Interface method names match spec: `listIssues`, `createPR`, `mergePR`, `getPRStatus`
- [x] `createIssue` returns `{ number, url }` per spec
- [x] `updateIssue` accepts `labels_add` / `labels_remove` per spec
- [x] `getPRStatus` returns `{ mergeable, ci_status, reviews }` per spec
- [x] [review] Gate 2: `updateIssue` in `adapter.ts:77-96` — tests added for body-only update, `labels_add`, `labels_remove`, `state: 'closed'`, `state: 'open'`, and combined update
- [x] [review] Gate 2/3: `listComments` `since` filter branch — tests added for since-filtered and all-old-comments cases
- [x] [review] Gate 1: `OrchestratorAdapter` interface aligned with spec method names and return types
- [x] [review] Gate 2: adapter instantiation branches — gate no longer applicable (instantiation code removed pending re-implementation)
- [x] [review] Gate 4: execGh fallback breaks DI — gate no longer applicable (instantiation code removed pending re-implementation)
