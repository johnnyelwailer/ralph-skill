# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### In Progress

- [ ] [review] Gate 1/Constitution Rule 18: Revert `aloop/cli/src/commands/orchestrate.ts` and `aloop/cli/src/commands/orchestrate.test.ts` — these files are explicitly Out of Scope per TASK_SPEC.md ("Runtime/orchestrator logic changes in `aloop/cli/src/**`") and Constitution Rules 12 + 18. All 5 behavior changes in orchestrate.ts are unrelated to CI setup (priority: high)
- [ ] [review] Gate 1/Constitution Rule 12: The `reviewPrDiff` change (orchestrate.ts line ~3566) silently auto-approves PRs when no reviewer is configured — replacing the safe 'flag-for-human' default with 'approve'. This is a security regression bundled into a CI setup issue. Must be reverted. File a separate issue if the auto-approve behavior is genuinely desired (priority: high)
- [ ] [review] Gate 1: The fix of 27 pre-existing test failures (commit aec9e571) belongs in a separate issue, not bundled here. If `bun run test` had pre-existing failures, CI should be set up first (showing the failures as a starting point), then a separate issue filed to fix them. Revert the orchestrate.ts/test.ts changes and file a follow-up issue for the test fixes (priority: high)

### Completed

- [x] Implement CI as described in the issue — `.github/workflows/ci.yml` with all jobs (CLI tests/type-check, dashboard tests/type-check/E2E, loop shell tests on Linux, PowerShell tests on Windows) and README badge
