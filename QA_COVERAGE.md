# QA Coverage Matrix — Issue #177: OrchestratorAdapter Refactor

| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
|---------|-----------|-------------|--------|--------|--------------|-------|
| adapter? field in TriageDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Optional field present |
| adapter? field in OrchestrateDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Optional field present |
| adapter? field in DispatchDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Optional field present |
| adapter? field in PrLifecycleDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Optional field present |
| adapter? field in ScanLoopDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Optional field present |
| adapter instantiation in orchestrateCommandWithDeps | orchestrate.ts | 2026-03-27 | 2652cc1 | PASS | 1/1 | Instantiated when filterRepo set and adapter absent |
| TypeScript build (npm run build) | aloop/cli | 2026-03-27 | 2652cc1 | PASS | 1/1 | No new compile errors |
| TypeScript type-check (npm run type-check) | aloop/cli | 2026-03-27 | 2652cc1 | PASS | 1/1 | No type errors |
| applyDecompositionPlan uses adapter.createIssue | orchestrate.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| triageMonitoringCycle uses adapter.listComments | orchestrate.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| checkPrGates uses adapter.getPrStatus/getPrChecks | orchestrate.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| prLifecycle uses adapter.mergePr | orchestrate.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| label ops use adapter.addLabels/removeLabels/ensureLabelExists | orchestrate.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| process-requests.ts adapter instantiation | process-requests.ts | never | - | UNTESTED | 0/5 | TODO task not yet done |
| orchestrate.test.ts mock adapter injected | orchestrate.test.ts | never | - | UNTESTED | 0/1 | TODO task not yet done |
| Test suite (npm test) — pre-existing failures | aloop/cli | 2026-03-27 | 2652cc1 | FAIL | - | 32 failures (pre-existing, reduced from 132 at base); issue-177 introduced no new failures |
