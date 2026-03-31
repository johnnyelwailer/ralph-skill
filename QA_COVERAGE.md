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
| TypeScript build (npm run build) | 2026-03-30 | e016e1a | PASS | Build clean exit 0 (iter 5) |
| adapter.test.ts unit tests | 2026-03-30 | e016e1a | PASS | 35/35 pass (unchanged from iter 4) |
| process-requests.ts makeAdapterForRepo conditional | 2026-03-30 | e016e1a | PASS | 18/18 tests pass (+4 new: repo present→adapter created+threaded; repo null→all slots undefined) |
| orchestrate.ts adapter-branch coverage | 2026-03-30 | e016e1a | PASS | 329/356, 27 fail (+10 new adapter-branch tests all pass: applyTriageResultsToIssue, resolveSpecQuestionIssues, mergePr, flagForHuman, processPrLifecycle) |
| resolveSpecQuestionIssues adapter fix | 2026-03-30 | 77bc077 | PASS | adapter path reachable in production (adapter: deps.adapter now passed at call site); confirmed by adapter-path test passing |
| tsc --noEmit (non-test files) | 2026-03-30 | e016e1a | PASS | Zero type errors on non-test files |
| TypeScript build (npm run build) | 2026-03-30 | 097fc63b | PASS | Build clean exit 0 (iter 6) |
| process-requests.ts updateIssueBodyViaAdapter | 2026-03-30 | 097fc63b | PASS | 23/23 tests pass (+5 new: makeAdapterForRepo subtests 5-7 for adapterType, updateIssueBodyViaAdapter 2 subtests — adapter present/absent) |
| meta.json adapter config (makeAdapterForRepo adapterType) | 2026-03-30 | 097fc63b | PASS | adapterType forwarded to createAdapter; defaults to "github"; unknown type throws; 3 new subtests all pass |
| refine-result execGh→adapter migration | 2026-03-30 | 097fc63b | PASS | updateIssueBodyViaAdapter dual-path: adapter.updateIssue when adapter present, fallback execGh when absent; both branches tested |
| orchestrate.ts fetchAndApplyBulkIssueState adapter path | 2026-03-30 | 097fc63b | PASS | 335/362 pass (+6 new tests all pass); adapter.fetchBulkIssueState used when adapter available, skips bulk fetch when neither execGh nor adapter present |
| TypeScript build (npm run build) | 2026-03-30 | 51c5eb860 | PASS | Build clean exit 0 (iter 7 — review commit) |
| adapter.test.ts unit tests | 2026-03-30 | 51c5eb860 | PASS | 35/35 pass (stable from iter 6) |
| process-requests.ts full suite | 2026-03-30 | 51c5eb860 | PASS | 23/23 pass (stable from iter 6) |
| orchestrate.test.ts full suite | 2026-03-30 | 51c5eb860 | PASS | 335/362 pass, 27 fail — identical to iter 6 baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-30 | 51c5eb860 | PASS | Zero type errors on non-test files |
| No hardcoded github.com URLs (adapter paths) | 2026-03-30 | 51c5eb860 | PASS | grep of orchestrate.ts, process-requests.ts, adapter.ts — zero non-comment github.com occurrences |
| meta.json adapter config wiring (live code) | 2026-03-30 | 51c5eb860 | PASS | meta.adapter read at process-requests.ts:354, forwarded to makeAdapterForRepo:149, defaults to 'github' |
| updateIssueBodyViaAdapter dual-path (live code) | 2026-03-30 | 51c5eb860 | PASS | adapter.updateIssue at line 135, fallback execGh at line 453 |
| fetchAndApplyBulkIssueState adapter path (live code) | 2026-03-30 | 51c5eb860 | PASS | adapter.fetchBulkIssueState used at orchestrate.ts:5317-5319 when adapter present |
| TypeScript build (npm run build) | 2026-03-30 | 62a92937e | PASS | Build clean exit 0 (iter 8 re-test) |
| adapter.test.ts unit tests | 2026-03-30 | 62a92937e | PASS | 35/35 pass — stable |
| process-requests.ts full suite | 2026-03-30 | 62a92937e | PASS | 23/23 pass — stable |
| orchestrate.test.ts full suite | 2026-03-30 | 62a92937e | PASS | 335/362 pass, 27 fail — identical baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-30 | 62a92937e | PASS | Zero type errors on non-test files |
| No hardcoded github.com URLs (adapter paths) | 2026-03-30 | 62a92937e | PASS | Only comment-line references in orchestrate.ts:4373, process-requests.ts:824; adapter.ts: none |
| meta.json adapter config wiring (live code) | 2026-03-30 | 62a92937e | PASS | meta.adapter→makeAdapterForRepo(line 354)→createAdapter; defaults to 'github'; confirmed via code grep |
| updateIssueBodyViaAdapter dual-path (live code) | 2026-03-30 | 62a92937e | PASS | adapter.updateIssue at line 135, execGh fallback at line 453; 23/23 tests cover both branches |
| fetchAndApplyBulkIssueState adapter path (live code) | 2026-03-30 | 62a92937e | PASS | adapter.fetchBulkIssueState at orchestrate.ts:5317-5319; confirmed stable |
| TypeScript build (npm run build) | 2026-03-30 | 2f59e40cf | PASS | Build clean exit 0 (iter 9 — final regression check after review gates 1-10) |
| adapter.test.ts unit tests | 2026-03-30 | 2f59e40cf | PASS | 35/35 pass — stable |
| process-requests.ts full suite | 2026-03-30 | 2f59e40cf | PASS | 23/23 pass — stable |
| orchestrate.test.ts full suite | 2026-03-30 | 2f59e40cf | PASS | 335/362 pass, 27 fail — identical baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-30 | 2f59e40cf | PASS | Zero type errors; exit 0 |
| TypeScript build (npm run build) | 2026-03-30 | 2ec73cf61 | PASS | Build clean exit 0 (iter 10) |
| adapter.test.ts unit tests | 2026-03-30 | 2ec73cf61 | PASS | 35/35 pass — stable |
| process-requests.ts full suite | 2026-03-30 | 2ec73cf61 | PASS | 23/23 pass; adapterType forwarded, defaults to "github", unknown type throws |
| orchestrate.test.ts full suite | 2026-03-30 | 2ec73cf61 | PASS | 335/362 pass, 27 fail — identical pre-existing baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-30 | 2ec73cf61 | PASS | Zero type errors; exit 0 |
| No hardcoded github.com URLs (adapter paths) | 2026-03-30 | 2ec73cf61 | PASS | Only 2 comment-line references; adapter.ts, orchestrate.ts, process-requests.ts all clean |
| 27 pre-existing orchestrate failures investigation | 2026-03-30 | 2ec73cf61 | PASS | Confirmed unrelated to adapter work: spec injection, DoR checks, CI/PR mocking — stable baseline |
| TypeScript build (npm run build) | 2026-03-30 | 07e21731f | PASS | Build clean exit 0 (iter 11) |
| adapter.test.ts unit tests | 2026-03-30 | 07e21731f | PASS | 35/35 pass — stable |
| process-requests.ts full suite | 2026-03-30 | 07e21731f | PASS | 23/23 pass — stable |
| orchestrate.test.ts full suite | 2026-03-30 | 07e21731f | PASS | 335/362 pass, 27 fail — identical pre-existing baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-30 | 07e21731f | PASS | Zero type errors; exit 0 |
| No hardcoded github.com URLs (adapter paths) | 2026-03-30 | 07e21731f | PASS | Zero non-comment github.com refs in adapter.ts, orchestrate.ts, process-requests.ts |
| TypeScript build (npm run build) | 2026-03-30 | a33ba1099 | PASS | Build clean exit 0 (iter 12) |
| adapter.test.ts unit tests | 2026-03-30 | a33ba1099 | PASS | 35/35 pass — stable |
| process-requests.ts full suite | 2026-03-30 | a33ba1099 | PASS | 23/23 pass — stable |
| orchestrate.test.ts full suite | 2026-03-30 | a33ba1099 | FAIL | 337/366 pass, 29 fail — 2 new regressions: runTriageMonitorCycle adapter.listComments not called (subtests 3-4); bug filed |
| tsc --noEmit (non-test files) | 2026-03-30 | a33ba1099 | PASS | Zero type errors; exit 0 |
| No hardcoded github.com URLs (adapter paths) | 2026-03-30 | a33ba1099 | PASS | Zero non-comment github.com refs in orchestrate.ts, process-requests.ts, adapter.ts |
| runTriageMonitorCycle adapter path (listComments) | 2026-03-30 | a33ba1099 | FAIL | orchestrate.test.ts:1615,1652 — adapter.listComments called 0 times; expected 1 and 2; regression from a33ba1099; bug filed |
| TypeScript build (npm run build) | 2026-03-31 | 57f728a68 | PASS | Build clean exit 0 (final-qa iter 13) |
| adapter.test.ts unit tests | 2026-03-31 | 57f728a68 | PASS | 36/36 pass (+1 new test vs iter 12) |
| process-requests.ts full suite | 2026-03-31 | 57f728a68 | PASS | 42/42 pass (+19 new tests vs iter 12; all pass) |
| orchestrate.test.ts full suite | 2026-03-31 | 57f728a68 | PASS | 352/379 pass, 27 fail — regression from iter 12 fixed; back to pre-existing baseline |
| runTriageMonitorCycle adapter path (listComments) | 2026-03-31 | 57f728a68 | PASS | Re-test: subtests 3+4 now pass (ok 3, ok 4 confirmed); regression from a33ba1099 fixed |
| tsc --noEmit (non-test files) | 2026-03-31 | 57f728a68 | PASS | Zero type errors; exit 0 |
| TypeScript build (npm run build) | 2026-03-31 | 28a1ca40a | PASS | Build clean exit 0 (final-qa iter 14 — docs-only changes since iter 13) |
| adapter.test.ts unit tests | 2026-03-31 | 28a1ca40a | PASS | 36/36 pass — stable |
| process-requests.ts full suite | 2026-03-31 | 28a1ca40a | PASS | 42/42 pass — stable |
| orchestrate.test.ts full suite | 2026-03-31 | 28a1ca40a | PASS | 352/379 pass, 27 fail — identical pre-existing baseline; no regressions |
| tsc --noEmit (non-test files) | 2026-03-31 | 28a1ca40a | PASS | Zero type errors; exit 0 |
