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

- [ ] [qa/P1] QA environment Bash tool non-functional: All shell commands return exit code 1 or 134 with no output → TypeScript build, unit test suite, and CLI binary install could not be executed → QA of compiled artifacts is blocked until env is fixed. Tested at 2026-03-27. (priority: high)

### In Progress

### Up Next

- [x] Thread adapter through child deps in orchestrate.ts — in `orchestrateCommandWithDeps`, pass `deps.adapter` into all constructed child deps objects: the `DispatchDeps`, `PrLifecycleDeps`, and the `ScanLoopDeps` object used when calling `runOrchestratorScanLoop`; also pass adapter into the `applyEstimateResults` call at line 1327

- [x] Thread adapter through scanDeps in process-requests.ts — instantiate adapter via `createAdapter({ type: 'github', repo }, execGhFn)` and include it in `scanDeps` and `scanDeps.prLifecycleDeps`; import `createAdapter` from `../lib/adapter.js`

- [ ] Migrate issue lifecycle calls in orchestrate.ts (TriageDeps / triage functions) — replace `deps.execGh(['issue', ...])` with `deps.adapter.closeIssue()`, `adapter.addLabels()`, `adapter.removeLabels()`, `adapter.postComment()`, `adapter.queryIssues()`, and `adapter.updateIssue()` in `triageIssue` (~line 345), `syncLabelsScan` (~line 2192), and `runTriageMonitorCycle`; also replace `deps.execGhIssueCreate` with `adapter.createIssue()` in `dispatchIssues` (~line 682) and DoR/spec-question creation (~line 2497)

- [ ] Migrate PR lifecycle calls in orchestrate.ts (PrLifecycleDeps) — replace `deps.execGh` calls in `createPrForIssue` (~line 4293), `mergeChildPr` (~line 3594), `getPrMergeStatus` (~line 3452), and `getPrChecks` (~line 3497) with `deps.adapter.createPr()`, `adapter.mergePr()`, `adapter.getPrStatus()`, `adapter.getPrChecks()`; replace PR close/comment via execGh at ~line 3805 with adapter equivalents

- [ ] Migrate scanLoop / bulk fetch execGh calls in orchestrate.ts — replace `deps.execGh` calls in `fetchAndApplyBulkIssueState` (~line 5210), issue close in `runOrchestratorScanPass` (~line 3935), and auto-merge PR creation in `runOrchestratorScanLoop` (~line 5744) with adapter calls

- [ ] Migrate process-requests.ts execGh calls — replace `execGh(['issue', 'edit', ...])` at line 432 (refine result handler) with `adapter.updateIssue()`, and replace `execGh` usage in `processCrResultFiles` at line 453 with adapter calls; update deps passed to these functions

- [ ] Meta.json adapter config — read `adapter` field from `meta.json` (default: `"github"`) and pass the type to `createAdapter()` in `orchestrateCommandWithDeps` instead of hardcoding `"github"`

### Deferred

- [ ] LocalAdapter implementation — file-based adapter storing issues as JSON in `.aloop/issues/`, PRs as branches; deferred per spec: "implement local adapter when there's demand"

### Completed

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [x] `GitHubAdapter` implementation wrapping `gh` CLI calls
- [x] `adapter.test.ts` with unit tests for `GitHubAdapter`
- [x] `adapter?` field added to `TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps` interfaces
- [x] Adapter instantiated in `orchestrateCommandWithDeps` when `filterRepo` is provided
- [x] `adapter?` field added to `applyEstimateResults` deps type; `deps.adapter` passed through in `orchestrateCommandWithDeps`
- [x] Adapter threaded through scanDeps in process-requests.ts (scanDeps, prLifecycleDeps, dispatchDeps)
