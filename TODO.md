# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### In Progress

### Up Next

### Deferred / Out of Scope
- [~] Fix silent failures in `loop_provenance.tests.sh` and `loop_finalizer_qa_coverage.tests.sh` (pre-existing test failures require changes to `loop.sh` — out of scope per TASK_SPEC.md scope: `.github/workflows/`, `README.md` only). Should be addressed in a separate issue.

### Completed

- [x] Create `.github/workflows/ci.yml` with push/PR triggers for `master`, `agent/*`, `aloop/*` branches
- [x] Add CI jobs: CLI tests (bun), CLI type-check, dashboard unit tests (npm), dashboard type-check, loop shell tests (Linux, 7 suites including bats), PowerShell loop tests (Windows), dashboard E2E tests with Playwright
- [x] Add CI status badge to `README.md` line 1 pointing at `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] [review] Revert out-of-scope changes in `orchestrate.ts` and `orchestrate.test.ts` back to master baseline
