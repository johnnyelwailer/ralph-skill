# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

- [x] Implement as described in the issue

## Notes

All acceptance criteria verified:
- All deps interfaces have `adapter?: OrchestratorAdapter` field
- `applyDecompositionPlan` uses `deps.adapter.createIssue()`
- `checkPrGates` uses `adapter.getPRStatus()` and `adapter.getPrChecks()`
- `mergePr` uses `adapter.mergePR()`
- `createPRViaAdapter` uses `adapter.createPR()`
- `updateParentTasklist` uses `adapter.getIssue()` + `adapter.updateIssue()`
- `updateIssueBodyViaAdapter` uses `adapter.updateIssue()`
- Adapter-related tests pass (5 failures are unrelated - GH request processor PATH hardening)
