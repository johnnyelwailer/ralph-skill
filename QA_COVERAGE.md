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
| TypeScript build (npm run build) | 2026-04-02 | d83d21ca1 | PASS | Build clean exit 0 (iter 16); all steps including dashboard vite build complete |
| adapter.test.ts unit tests | 2026-04-02 | d83d21ca1 | PASS | 41/41 pass; includes new setIssueStatus test (ok 15) |
| GitHubAdapter.setIssueStatus() implementation | 2026-04-02 | d83d21ca1 | PASS | setIssueStatus test passes; GraphQL project status sync now via adapter interface |
| process-requests.ts full suite | 2026-04-02 | d83d21ca1 | PASS | 42/42 pass (stable, +0 regressions) |
| orchestrate.test.ts — execGh fallback removal | 2026-04-02 | d83d21ca1 | PASS | 372/379 pass; 20 tests fixed vs prior baseline of 352/379; all adapter-path tests for triageComments, resolveSpecQuestionIssues, applyEstimateResults, mergePr, createTrunkToMainPr, createPrForChild, flagForHuman, checkPrGates, processPrLifecycle pass |
| tsc --noEmit --skipLibCheck | 2026-04-02 | d83d21ca1 | PASS | Zero type errors |
| orchestrate.test.ts remaining failures (pre-existing) | 2026-04-02 | d83d21ca1 | FAIL (pre-existing) | 7 failures: launchChildLoop (2 subtests), queueGapAnalysisForIssues (1 subtest: test expects embedded spec but impl correctly uses file paths per SPEC-ADDENDUM), epic decomposition (2 subtests: same reason), orchestrateCommandWithDeps multi-file spec (2 subtests), prompt content verification — all pre-existing before d83d21ca1 |
| Dead execGh fallback branches removed | 2026-04-02 | d83d21ca1 | PASS | No dual if(adapter)/else(execGh) patterns remain for standard issue/PR/comment operations; syncIssueProjectStatus and related dead code removed |
| TypeScript build (npm run build) | 2026-04-03 | d525d05e6 | PASS | Build clean exit 0 (iter 17); all steps complete |
| tsc --noEmit --skipLibCheck (non-test files) | 2026-04-03 | d525d05e6 | PASS | Zero type errors in non-test files; production code type-safe |
| tsc --noEmit --skipLibCheck (with test files) | 2026-04-03 | d525d05e6 | FAIL | 20+ TS2353 errors in orchestrate.test.ts: execGh used in Partial<PrLifecycleDeps> after execGh removed from that type; bug filed |
| adapter.test.ts unit tests | 2026-04-03 | d525d05e6 | PASS | 45/45 pass; includes listPRs (4 subtests), setIssueStatus (5 subtests) |
| process-requests.ts full suite | 2026-04-03 | d525d05e6 | PASS | 42/42 pass (stable) |
| github-monitor.test.ts (EtagCache) | 2026-04-03 | d525d05e6 | PASS | 33/33 pass; EtagCache renamed to github-etag-cache.json works correctly |
| orchestrate.test.ts full suite | 2026-04-03 | d525d05e6 | FAIL | 377/379 pass, 2 fail — checkPrGates subtests 5+6 ("returns pending when workflows exist but checks are not yet reported" and "fails CI gate when workflows exist and check query errors"); regression from execGh removal in 46ad13bc6; bug filed |
| listPRs adapter method | 2026-04-03 | d525d05e6 | PASS | 4/4 subtests pass in adapter.test.ts: lists with default filters, filters by head branch, passes state filter, returns empty array when none found |
| getPrDiff and closePR adapter methods | 2026-04-03 | d525d05e6 | FAIL (gap) | Methods added in 46ad13bc6 have no unit tests in adapter.test.ts; only tested indirectly via orchestrate.test.ts mocks; bug filed as P2 |
