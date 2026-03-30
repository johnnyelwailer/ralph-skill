# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

### Up Next

- [ ] [review] **Gate 2/Gate 5: Fix broken runTriageMonitorCycle adapter tests** — `createMockAdapter({ listComments: ... })` spreads the override into `base` after `calls.push(...)` tracking is wired, so the override replaces the tracked implementation and `calls` never records `listComments` calls. Tests at `orchestrate.test.ts:1614-1616` and `1651-1654` always see `listCalls.length === 0`. Fix: wrap override in a closure that pushes to `calls` first then delegates to the override, OR capture the override and call `calls.push` around it. The two failing tests are the only regressions vs the 34-failure baseline (now 36). (priority: high)

- [ ] [review] **Gate 2/Gate 3: Add adapter-path tests for process-requests.ts changes** — `ecad85f99` migrated four call-sites to the adapter but added zero tests: (1) `adapter.createIssue()` in sub-decomposition at line 419, (2) `adapter.createIssue()` in Phase 2 at line ~542, (3) `adapter.createPR()` in Phase 2c at line ~659, (4) `updateParentTasklist()` refactored to use `adapter.getIssue()` + `adapter.updateIssue()` at lines 1149-1163. All four adapter-guarded branches have 0% coverage. Add tests following the `makeAdapterForRepo` test pattern: inject a mock adapter, exercise the path, assert exact adapter call args. (priority: high)

- [ ] [review] **Gate 4: Remove execGhForTriage DI bypass in runTriageMonitorCycle** — `orchestrate.ts:2120-2125` creates an inline `spawnSync('gh', ...)` fallback when `deps.execGh` is absent. In adapter-only mode (tests and future LocalAdapter use), `applyTriageResultsToIssue` receives a function that spawns real `gh` CLI — defeating DI and violating CONSTITUTION rule #4. Fix: pass `undefined` as `execGh` to `applyTriageResultsToIssue` when `deps.execGh` is absent (let it guard internally), or make `applyTriageResultsToIssue` accept optional `execGh` and skip label operations when absent. Remove the dynamic `import('node:child_process')` inline. (priority: high)

- [ ] [qa/P1] **runTriageMonitorCycle adapter.listComments not called**: New adapter-path tests added at commit a33ba1099 fail — "uses adapter.listComments when adapter is present" (expected 1 call, got 0) and "adapter path fetches PR comments via listComments" (expected 2 calls, got 0). The adapter path for `runTriageMonitorCycle` is not routing to `adapter.listComments` despite adapter being present in deps. orchestrate.test.ts:1615 and 1652. Regression introduced in a33ba1099. Tested at iter 12. (priority: high)

- [x] **Migrate process-requests.ts GH calls to adapter** — Replace all `spawnSync('gh', ...)` for issue/PR CRUD with adapter calls:
  - `createGhIssue()` helper → `adapter.createIssue()`
  - `updateParentTasklist()`: `spawnSync gh issue view` + `gh issue edit` → `adapter.getIssue()` + `adapter.updateIssue()`
  - Phase 2c PR creation: `spawnSync gh pr create` → `adapter.createPr()`
  - Phase 1c refine result body update: `spawnSync gh issue edit --body-file` → `adapter.updateIssue()`
  - Verify adapter is created once at `processRequests()` entry point and passed through deps (already partially done at line 354)
  - Leave all `spawnSync('gh', ['api', 'graphql', ...])` project board calls unchanged (out of scope)

- [ ] **Migrate orchestrate.ts — checkPrGates and prLifecycle** — Replace PR lifecycle call-sites:
  - `checkPrGates`: `execGh(['pr', 'view', ..., '--json', 'mergeable,mergeStateStatus'])` → `adapter.getPrStatus()`; CI check queries → `adapter.getPrChecks()`
  - `prLifecycle` merge: `execGh(['pr', 'merge', ...])` → `adapter.mergePr()`

- [ ] **Migrate orchestrate.ts — label operations** — Replace label management call-sites in triage/dispatch:
  - `execGh(['issue', 'edit', '--add-label'])` → `adapter.addLabels()`
  - `execGh(['label', 'create', ...])` → `adapter.ensureLabelExists()`
  - `execGh(['issue', 'edit', '--remove-label'])` → `adapter.removeLabels()` (where applicable)

- [ ] **Update orchestrate.test.ts with mock adapter** — Inject mock `OrchestratorAdapter` into test fixtures that exercise migrated functions; ensure all existing tests pass

- [ ] **Cleanup: remove dead code** — After all call-sites migrated:
  - Remove `execGhIssueCreate` from `OrchestrateDeps` interface (dead code per rule #13)
  - Remove any other deprecated fallback fields that are now unused
  - Verify `npm run build` compiles and `npm test` passes

### Completed

- [x] **Migrate orchestrate.ts — applyDecompositionPlan and triageMonitoringCycle** — Two targeted call-sites migrated:
  - `applyDecompositionPlan`: `deps.execGhIssueCreate` → `deps.adapter.createIssue()` with fallback
  - `runTriageMonitorCycle`: `execGh(['issue-comments', ...])` → `adapter.listComments()` with fallback
  - Caller gate checks updated to accept `deps.adapter` alongside `deps.execGh`
  - Adapter threaded to `applyDecompositionPlan` in process-requests.ts
  - Adapter-path tests added for both functions

