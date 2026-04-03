# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

- [ ] Implement as described in the issue
- [ ] [qa/P1] checkPrGates subtests 5+6 fail — stale execGh in PrLifecycleDeps test mocks: orchestrate.test.ts uses `execGh` in `Partial<PrLifecycleDeps>` at ~20 locations after execGh was removed from that type (commit 46ad13bc6). Causes TS2353 errors + 2 runtime failures (checkPrGates subtests 5 "returns pending when workflows exist but checks are not yet reported" and 6 "fails CI gate when workflows exist and check query errors"). Fix: update test mocks to use adapter.getPrChecks/getPRStatus instead of execGh. Tested at current HEAD d525d05e6. (priority: high)
- [ ] [qa/P2] getPrDiff and closePR adapter methods lack unit tests: methods added in 46ad13bc6 are not covered in adapter.test.ts — only tested indirectly via orchestrate.test.ts mocks. Add unit tests for closePR (calls gh pr close with comment) and getPrDiff (calls gh pr diff). Tested at current HEAD d525d05e6.
