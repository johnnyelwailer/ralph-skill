# Issue #124: GH API errors must not corrupt orchestrator state — failed PRs need recovery

## Current Phase: Implementation

### Completed
- [x] API errors should not change issue state — `checkPrGates()` catches API errors and returns 'pending' gates instead of 'fail'; `reviewPrDiff()` returns 'pending' on fetch errors; tests verify at orchestrate.test.ts:2968+
- [x] Blocked issues must have a reason — `postBlockedReasonComment()` (orchestrate.ts:3166) posts GH issue comments; called for merge conflicts (line 3529), CI failures (line 3599), child session stops (line 4310); tests verify at orchestrate.test.ts:3023+

### In Progress
- [x] Add recovery mechanism for failed issues with open PRs — `recoverFailedIssues()` scans `failed` issues with `pr_number !== null` during each scan pass (step 2.7), re-checks PR gates via `checkPrGates()`, resets state to `pr_open` if all gates pass, clears `ci_failure_signature`/`ci_failure_retries`/`ci_failure_summary`/`rebase_attempts`. Integrated into `runOrchestratorScanPass()`. Logs `failed_issue_recovered` per issue and `recovery_pass_complete` for the pass. Tests in orchestrate.test.ts.

### Up Next
- [x] Add `blocked_reason` field to `OrchestratorIssue` interface (orchestrate.ts:66) — store the reason locally in state alongside posting the GH comment, so recovery logic can log what was previously blocking and the dashboard can display it without an API call
- [x] Update `allDone` check (orchestrate.ts:5451) — currently `failed` is terminal; with recovery, only issues that are `failed` AND have no `pr_number` (or have exhausted a recovery attempt limit) should count as terminal. Otherwise a recoverable-failed issue would prematurely stop the orchestrator loop.
- [x] Add tests for recovery mechanism — 6 tests: recovered to `pr_open` when gates pass, stays failed when CI fails, skips issues without PR, handles API errors gracefully, stays failed with merge conflicts, scan pass integration test [reviewed: gates 1-10 pass]
- [ ] Move artifacts to `.aloop/` subfolder in worktree — change artifact paths from `worktreePath/TODO.md` to `worktreePath/.aloop/TODO.md` for: TODO.md, STEERING.md, QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md. Files to update: orchestrate.ts (line 2879 seed, line 2887 gitignore list), steer.ts (line 65), process-requests.ts (lines 201, 245), monitor.ts (lines 22, 150), dashboard.ts (lines 60, 551)
- [ ] Update prompt templates for `.aloop/` artifact paths — templates reference `@TODO.md`, `STEERING.md` etc. by name; update PROMPT_plan.md, PROMPT_steer.md, PROMPT_build.md to reference `.aloop/TODO.md` etc.
- [ ] Update `.gitignore` handling for `.aloop/` artifacts — change the gitignore append logic (orchestrate.ts:2882-2892) to add `.aloop/` directory pattern instead of individual root-level filenames; update e2e test fixtures (dashboard/e2e/fixtures/workdir/)
- [ ] Add tests for `.aloop/` artifact paths — verify artifacts are created in `.aloop/` subfolder, gitignore entries are correct, monitor/dashboard read from new paths
- [ ] [qa/P2] `aloop orchestrate --help` exits 1 with no output: ran `node dist/index.js orchestrate --help` → exit code 1, zero stdout/stderr. Spec says `orchestrate` should show help with flags like `--spec`, `--concurrency`, `--budget`. Needs re-test after disk space freed (ENOSPC may have contributed). Tested at commit b0afbfc.
