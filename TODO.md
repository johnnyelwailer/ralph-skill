# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

- [x] Implement as described in the issue

## Verification

All acceptance criteria verified:
- `TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps` have `adapter?: OrchestratorAdapter`
- `applyDecompositionPlan` uses `deps.adapter.createIssue()` when adapter present
- `checkPrGates` uses `adapter.getPRStatus()` and `adapter.getPrChecks()` 
- PR merge in `prLifecycle` uses `adapter.mergePR()`
- `process-requests.ts` PR creation uses `createPRViaAdapter()`
- `updateParentTasklist` uses `adapter.getIssue()` + `adapter.updateIssue()`
- Issue body updates use `adapter.updateIssue()`
- GH project board sync left unchanged (no adapter equivalent)
- Git calls left unchanged
- Adapter created once at entry points
