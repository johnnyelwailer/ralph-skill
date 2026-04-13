# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### In Progress

### Up Next

- [ ] [qa/P1] loop_provenance.tests.sh silent failures: `bash aloop/bin/loop_provenance.tests.sh` → "FAIL: loop.sh emitted top-level local warning" + "FAIL: Provenance trailers verification failed" → spec says tests must report failures; script exits 0 so CI shows PASS even when tests fail. Tested at iter 1. (priority: high)
- [ ] [qa/P1] loop_finalizer_qa_coverage.tests.sh silent failures: `bash aloop/bin/loop_finalizer_qa_coverage.tests.sh` → 3 failures including `check_finalizer_qa_coverage_gate: command not found` at line 137 → function is missing or renamed; script exits 0 so CI cannot detect the breakage. Tested at iter 1. (priority: high)

### Deferred / Out of Scope
- [~] Fix silent failures in `loop_provenance.tests.sh` and `loop_finalizer_qa_coverage.tests.sh` (filed as P1 bugs above). Out of scope for this issue (TASK_SPEC.md scope: `.github/workflows/`, `README.md` only). Should be addressed in a separate issue.

### Completed

- [x] Create `.github/workflows/ci.yml` with push/PR triggers for `master`, `agent/*`, `aloop/*` branches
- [x] Add CI jobs: CLI tests (bun), CLI type-check, dashboard unit tests (npm), dashboard type-check, loop shell tests (Linux, 7 suites including bats), PowerShell loop tests (Windows), dashboard E2E tests with Playwright
- [x] Add CI status badge to `README.md` line 1 pointing at `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] [review] Revert out-of-scope changes in `orchestrate.ts` and `orchestrate.test.ts` back to master baseline. Commit `aec9e571` bundled 8 behavior changes: `validateDoR` regex/criterion changes, `applyEstimateResults` status expansion, `getDispatchableIssues` dor_validated guard, `launchChildLoop` SPEC.md seeding, `checkPrGates` pending-vs-pass, `reviewPrDiff` auto-approve (security regression), `monitorChildSessions` state tracking. Reverted both files to master baseline; 49 pre-existing test failures unchanged.
