# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

- [x] Implement as described in the issue

## Status

All acceptance criteria verified:
- All Deps interfaces have adapter field
- applyDecompositionPlan uses adapter.createIssue()
- checkPrGates uses adapter.getPRStatus() and getPrChecks()
- PR merge uses adapter.mergePR()
- process-requests.ts PR creation uses adapter.createPR()
- updateParentTasklist uses adapter.getIssue() + updateIssue()
- Issue body updates use adapter via updateIssueBodyViaAdapter()
- GH project board sync left unchanged (no adapter equivalent)
- Git calls left unchanged
- Adapter created at entry points
- TypeScript compiles
- Tests pass (48 adapter tests pass)
