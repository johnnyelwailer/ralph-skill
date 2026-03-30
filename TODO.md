# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

### Up Next

- [x] [review] **Gate 2/Gate 3: Add adapter-path tests for process-requests.ts changes** — `ecad85f99` migrated four call-sites to the adapter but added zero tests: (1) `adapter.createIssue()` in sub-decomposition at line 419, (2) `adapter.createIssue()` in Phase 2 at line ~542, (3) `adapter.createPR()` in Phase 2c at line ~659, (4) `updateParentTasklist()` refactored to use `adapter.getIssue()` + `adapter.updateIssue()` at lines 1149-1163. All four adapter-guarded branches have 0% coverage. Add tests following the `makeAdapterForRepo` test pattern: inject a mock adapter, exercise the path, assert exact adapter call args. (priority: high)

- [x] **Migrate orchestrate.ts — checkPrGates** — Migrated `checkPrGates` to use adapter-with-fallback pattern. Gate 1 uses `adapter.getPRStatus()` for mergeability check. Gate 2 uses `adapter.getPrChecks()` for CI check details. Added `getPrChecks` to `OrchestratorAdapter` interface. Added 5 adapter-path tests.

- [ ] **Migrate orchestrate.ts — applyEstimateResults label ops and spec-question issue creation** — `applyEstimateResults` (line ~2459) has two remaining unmigrated call-sites: (1) label ops at lines 2500-2504 (`deps.execGh(['issue', 'edit', ...labelsToAdd...])`) with no adapter alternative; (2) spec-question issue creation at lines 2549-2551 (`deps.execGhIssueCreate(...)`) instead of `adapter.createIssue()`. Add optional `adapter?: OrchestratorAdapter` to the deps type and use the adapter-with-fallback pattern. Note: all other label ops in `applyTriageResultsToIssue` and spec-question resolution are already migrated.

- [x] **Add adapter-path tests for checkPrGates** — Added 5 tests in `checkPrGates adapter path` describe block: (1) adapter.getPRStatus/getPrChecks called, (2) not-mergeable returns fail, (3) pending checks returns pending, (4) failed checks returns fail with names, (5) fallback to execGh when no adapter.

- [ ] **Cleanup: remove dead code** — After all call-sites migrated:
  - Remove `execGhIssueCreate` from `OrchestrateDeps` interface when no remaining usages (currently still used as fallback in `applyDecompositionPlan` line 679-680 and `applyEstimateResults` line 2549-2551 — defer until those are migrated)
  - Remove any other deprecated fallback fields that are now unused
  - Verify `npm run build` compiles and `npm test` passes

### Completed

- [x] [review] **Gate 2/Gate 5: Fix broken runTriageMonitorCycle adapter tests** — `createMockAdapter({ listComments: ... })` spreads the override into `base` after `calls.push(...)` tracking is wired, so the override replaces the tracked implementation and `calls` never records `listComments` calls. Tests at `orchestrate.test.ts:1614-1616` and `1651-1654` always see `listCalls.length === 0`. Fix: wrap each override in a closure that pushes to `calls` first then delegates to the override (for all overridable methods), rather than spreading overrides raw. The two failing tests are the only regressions vs the 34-failure baseline (now 36). (priority: high)

- [x] [review] **Gate 4: Remove execGhForTriage DI bypass in runTriageMonitorCycle** — Removed inline `spawnSync('gh', ...)` fallback at `orchestrate.ts:2120-2125`. Made `TriageDeps.execGh` optional. When adapter is present and `execGh` is absent, `undefined` is passed through instead of spawning real `gh` CLI. All adapter-path `deps.execGh` calls in `applyTriageResultsToIssue` are already guarded behind `if (deps.adapter)` checks.

- [x] **Migrate process-requests.ts GH calls to adapter** — Replaced all `spawnSync('gh', ...)` for issue/PR CRUD with adapter calls:
  - Phase 1c body update → `adapter.updateIssue()` (line 135)
  - Sub-decomposition issue creation → `adapter.createIssue()` (line 419)
  - Phase 2 issue creation → `adapter.createIssue()` (line 544)
  - Phase 2c PR creation → `adapter.createPR()` (line 663)
  - `updateParentTasklist()` → `adapter.getIssue()` + `adapter.updateIssue()` (lines 1156-1160)
  - `makeAdapterForRepo` reads `meta.adapter` from `meta.json` for adapter type selection (line 354)

- [x] **Migrate orchestrate.ts — applyDecompositionPlan, triageMonitoringCycle, mergePr, flagForHuman, label ops** — Migrated:
  - `applyDecompositionPlan`: `deps.execGhIssueCreate` → `deps.adapter.createIssue()` with fallback
  - `runTriageMonitorCycle`: `execGh(['issue-comments', ...])` → `adapter.listComments()` with fallback
  - `mergePr`: `execGh(['pr', 'merge', ...])` → `deps.adapter.mergePR()` with fallback
  - `createTrunkToMainPr`: `execGh(['pr', 'create', ...])` → `deps.adapter.createPR()` with fallback
  - `flagForHuman`: label/comment ops → adapter pattern with fallback
  - `applyTriageResultsToIssue`: all label ops → adapter pattern with fallback
  - Spec question resolution label ops → adapter pattern with fallback
  - Adapter-path tests added for `applyDecompositionPlan`, `runTriageMonitorCycle`, `mergePr`, `processPrLifecycle`
