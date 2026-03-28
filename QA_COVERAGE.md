# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| OrchestratorAdapter interface (adapter.ts) | 2026-03-27 | b64a473 | PASS (static) | Interface present with all required methods; static analysis only — build/test blocked by env |
| GitHubAdapter implementation | 2026-03-27 | b64a473 | PASS (static) | Implements all adapter interface methods; static analysis only |
| adapter? field in all deps interfaces | 2026-03-27 | b64a473 | PASS (static) | TriageDeps, OrchestrateDeps, DispatchDeps, PrLifecycleDeps, ScanLoopDeps all have adapter? field |
| Adapter instantiation in orchestrateCommandWithDeps | 2026-03-27 | b64a473 | PASS (static) | Guard + createAdapter call present at ~line 1004-1011 |
| Adapter threaded through process-requests.ts scanDeps | 2026-03-27 | b64a473 | PASS (static) | adapter in scanDeps, prLifecycleDeps, dispatchDeps confirmed |
| TypeScript build (npm run build) | 2026-03-28 | 257a6f2 | PASS | Build succeeds after `npm install` + `npm install --prefix dashboard`; all steps complete with exit 0 |
| adapter.test.ts unit tests | 2026-03-28 | 257a6f2 | PASS | 27/27 tests pass via `npx tsx --test src/lib/adapter.test.ts`; all GitHubAdapter methods tested |
| OrchestratorAdapter interface vs spec | 2026-03-28 | 257a6f2 | PASS | All 11 interface methods match spec lines 982-1000 exactly: signatures, param names, return types |
| process-requests.ts exports (post-adapter work) | 2026-03-28 | 257a6f2 | FAIL | 7 exported functions deleted by d49686908; process-requests.test.ts fails entirely at import; bug filed |
| orchestrate.ts label enrichment (post-adapter work) | 2026-03-28 | 257a6f2 | FAIL | wave/N labels and deriveComponentLabels removed by d49686908; 15 additional orchestrate test failures; bug filed |
| TypeScript build (npm run build) | 2026-03-28 | 8a2efa4 | PASS | Build clean exit 0 after all recent fixes |
| process-requests.ts exports restored | 2026-03-28 | 8a2efa4 | PASS | 14/14 tests pass; all 7 deleted exports restored (verified re-test after fix) |
| orchestrate.ts wave/N + component labels fix | 2026-03-28 | 8a2efa4 | PASS | Suite 60 subtests 1-4 pass: wave/N label alongside aloop/wave-N, component labels from file_hints, label preservation, empty file_hints |
| OrchestratorIssueState 'review' member | 2026-03-28 | 8a2efa4 | PASS | TS2367 gone; `tsc --noEmit` reports zero errors in non-test files; process-requests.ts:551 comparison valid |
| applyDecompositionPlan dependency body injection | 2026-03-28 | 8a2efa4 | FAIL | Suite 60 subtests 5-6 fail: "Depends on #X, #Y" not added to issue bodies; regression from d49686908; bug filed |
| applyEstimateResults complexity/priority labels | 2026-03-28 | 8a2efa4 | FAIL | Suite 61 all 4 subtests fail: complexity/M,L,S and P1 labels not applied via execGh; EstimateResult type missing 'priority' field (TS2353); regression from d49686908; bug filed |
