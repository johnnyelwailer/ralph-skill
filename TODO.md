# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### In Progress

### Up Next

- [ ] [review] Revert out-of-scope production changes in `aloop/cli/src/commands/orchestrate.ts` — REVIEW_LOG identified 8 behavior changes bundled into this CI issue, all explicitly out of scope per TASK_SPEC.md. Most critical: `reviewPrDiff` changed `verdict: 'flag-for-human'` → `verdict: 'approve'` when no reviewer configured — a security regression that enables automated merges without review. Revert all 8 changes: `validateDoR` regex/criterion changes, `applyEstimateResults` status progression expansion, `getDispatchableIssues` dor_validated guard, `launchChildLoop` SPEC.md seeding, `checkPrGates` pending-vs-pass change, `reviewPrDiff` auto-approve, `monitorChildSessions` state/status tracking. Revert `aloop/cli/src/commands/orchestrate.test.ts` to match (remove test coverage for the reverted production changes only; retain any fixture additions that fix pre-existing failures unrelated to the reverted code).

- [ ] [qa/P1] loop_provenance.tests.sh silent failures: `bash aloop/bin/loop_provenance.tests.sh` → "FAIL: loop.sh emitted top-level local warning" + "FAIL: Provenance trailers verification failed" → spec says tests must report failures; script exits 0 so CI shows PASS even when tests fail. Tested at iter 1. (priority: high)
- [ ] [qa/P1] loop_finalizer_qa_coverage.tests.sh silent failures: `bash aloop/bin/loop_finalizer_qa_coverage.tests.sh` → 3 failures including `check_finalizer_qa_coverage_gate: command not found` at line 137 → function is missing or renamed; script exits 0 so CI cannot detect the breakage. Tested at iter 1. (priority: high)

### Completed

- [x] Create `.github/workflows/ci.yml` with push/PR triggers for `master`, `agent/*`, `aloop/*` branches
- [x] Add CI jobs: CLI tests (bun), CLI type-check, dashboard unit tests (npm), dashboard type-check, loop shell tests (Linux, 7 suites including bats), PowerShell loop tests (Windows), dashboard E2E tests with Playwright
- [x] Add CI status badge to `README.md` line 1 pointing at `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
