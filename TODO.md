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

### QA — 2026-03-30 (iter 5): PASS
- Build clean, adapter.test 35/35, process-requests 18/18 (+4 new makeAdapterForRepo tests), orchestrate 329/356
- 10 new adapter-branch tests in orchestrate.test.ts (applyTriageResultsToIssue, resolveSpecQuestionIssues, mergePr, flagForHuman, processPrLifecycle) — all pass
- resolveSpecQuestionIssues adapter fix confirmed: adapter path now reachable in production
- Failure count stable at 27 (pre-regression baseline)
- No new bugs

### In Progress

- [x] [review] Gate 2/3: `process-requests.ts:941-943` — `repo ? createAdapter(...) : undefined` conditional has zero test coverage. Add tests for: (a) `repo` present → adapter created and passed into `scanDeps.adapter`, `prLifecycleDeps.adapter`, and `dispatchDeps.adapter`; (b) no `repo` → all three adapter slots are `undefined`. (Same finding as 2026-03-27 review Gate 2, re-opened after code was re-added.) (priority: high) [reviewed: gates 1-9 pass]

- [x] [review] Add adapter-branch tests for orchestrate.ts dual-path functions: `applyTriageResultsToIssue`, `resolveSpecQuestionIssues`, `mergePr`, `flagForHuman`, and `processPrLifecycle` each have `if (deps.adapter) ... else { execGh }` paths with zero test coverage for the adapter branch. Add tests covering adapter path for each. (priority: high) [reviewed: gates 1-9 pass]

- [x] Fix: `resolveSpecQuestionIssues` call at orchestrate.ts:5496 does not pass `adapter` from `deps` — the function accepts `adapter` in its deps type but the call site omits it, so the adapter branch is never reached in production. Add `adapter: deps.adapter` to the call. (priority: high) [reviewed: gates 1-9 pass]

- [x] [qa/P1] orchestrate.ts applyDecompositionPlan missing dependency body injection: fixed — enriched body with "Depends on #X, #Y" injected and stored in state. RESOLVED: 2026-03-29.

- [x] [qa/P1] orchestrate.ts applyEstimateResults not applying complexity/priority labels via execGh: fixed — added `priority?: string` to `EstimateResult` and execGh label calls in `dor_passed` branch. RESOLVED: 2026-03-29.

### Up Next

- [x] Re-add adapter field to deps interfaces (`TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps`) and thread `deps.adapter` through child deps in `orchestrateCommandWithDeps`

- [x] Re-add adapter instantiation in `process-requests.ts` — create adapter when `repo` is provided, using static import of `node:child_process` and requiring `execGh` (no silent fallback). Threaded through `scanDeps`, `prLifecycleDeps`, and `dispatchDeps`. 2026-03-30.

- [x] Migrate issue lifecycle calls in orchestrate.ts (TriageDeps / triage functions) — replace `deps.execGh(['issue', ...])` with `adapter.closeIssue()`, `adapter.addLabels()`, `adapter.removeLabels()`, `adapter.postComment()`, `adapter.listIssues()`, and `adapter.updateIssue()` in triage functions; replace `deps.execGhIssueCreate` with `adapter.createIssue()` in dispatch

- [x] Migrate PR lifecycle calls in orchestrate.ts (PrLifecycleDeps) — replaced `deps.execGh` calls in `mergePr()` with `adapter.mergePR()` and in `processPrLifecycle()` review feedback with `adapter.postComment()`. Remaining calls (`pr view`, `pr diff`, `pr close`, `gh api`) have no direct adapter equivalents.

- [x] Migrate scanLoop / bulk fetch execGh calls in orchestrate.ts — three specific changes:
  1. `fetchAndApplyBulkIssueState` (line ~5270): add `adapter?` to its `deps` Pick type; when `deps.adapter` is present call `deps.adapter.fetchBulkIssueState(...)` instead of `fetchBulkIssueState(repo, deps.execGh, ...)`. Update the call-site guard at line ~5429 to also trigger when `deps.adapter` is defined (currently only `deps.execGh`).
  2. `createTrunkToMainPr` (line ~3631): add `adapter?` to its `deps` Pick type; when `deps.adapter` is present call `deps.adapter.createPR(title, body, trunkBranch, 'main')` instead of raw `execGh` PR create / list calls. Update the call-site guard at line ~5836 similarly.
  3. `createPrForChild` (line ~4374): add `adapter?` to `MonitorChildDeps`; when present call `deps.adapter.createPR(...)` for PR creation (keep the `gh api` branch-existence check as raw execGh — no adapter equivalent). Update the call-site guard at line ~5602 similarly.
  Add tests for each adapter branch.

- [ ] Migrate process-requests.ts execGh calls — one raw `execGh` call at line ~433 for refine-result body update: `execGh(['issue', 'edit', ..., '--body-file', bodyFile])`. Move adapter creation earlier (before the refine-result handler closure), then use `adapter.updateIssue(issue.number, { body: result.updated_body })` when adapter is available, falling back to raw `execGh` when not. Add test for the adapter path.

- [ ] Meta.json adapter config — update `makeAdapterForRepo` in `process-requests.ts` to accept an optional `adapterType?: string` parameter (default `'github'`); read `meta.adapter` from the parsed meta object at line ~318 and pass it to `makeAdapterForRepo`; pass it through to `createAdapter({ type: adapterType, repo }, execGh)`. Add test asserting the type is forwarded.

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
- [x] [review] Gate 5: `process-requests.ts:551` — `issue.state !== 'review'` dead comparison fixed by adding `'review'` to `OrchestratorIssueState` union type
- [x] `applyDecompositionPlan` adds `wave/N` label alongside `aloop/wave-N` and derives component labels from `file_hints`
- [x] [review] Uncommitted changes: adapter-migration code (triage, spec-question, PR lifecycle) committed in `49c01a745`
