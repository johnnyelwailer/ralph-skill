# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

### Up Next

- [x] **Migrate process-requests.ts GH calls to adapter** — Replace all `spawnSync('gh', ...)` for issue/PR CRUD with adapter calls:
  - `createGhIssue()` helper → `adapter.createIssue()`
  - `updateParentTasklist()`: `spawnSync gh issue view` + `gh issue edit` → `adapter.getIssue()` + `adapter.updateIssue()`
  - Phase 2c PR creation: `spawnSync gh pr create` → `adapter.createPr()`
  - Phase 1c refine result body update: `spawnSync gh issue edit --body-file` → `adapter.updateIssue()`
  - Verify adapter is created once at `processRequests()` entry point and passed through deps (already partially done at line 354)
  - Leave all `spawnSync('gh', ['api', 'graphql', ...])` project board calls unchanged (out of scope)

- [ ] **Migrate orchestrate.ts — applyDecompositionPlan and triageMonitoringCycle** — Replace two targeted call-sites:
  - `applyDecompositionPlan`: `deps.execGhIssueCreate` → `deps.adapter.createIssue()` when adapter present; fall back to `execGhIssueCreate` otherwise
  - `triageMonitoringCycle` comment fetching: `execGh(['issue', 'view', ..., '--json', 'comments'])` → `adapter.listComments()`
  - Verify adapter is created once at `orchestrateCommandWithDeps()` entry and passed through deps

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

