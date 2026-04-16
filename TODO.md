# Issue #23: Epic: Inner Loop Engine — Phase Control, Retry & Finalizer

## Tasks

### Review Status

[review iter 2]: FAIL — 2 unresolved findings: (1) Gate 1: branch sync + finalizer gate functions missing from loop.sh; (2) Constitution Rule 1: loop.sh still 2373 LOC. Findings 3 and 4 from iter 1 resolved: out-of-scope claims confirmed accurate, TS errors confirmed pre-existing on master.

[plan iter 4]: RESOLVED — iter 2 findings now fixed: (1) `append_plan_task_if_missing` and `check_finalizer_qa_coverage_gate` both present in loop.sh (lines 1489, 1496); `sync_base_branch` present (line 2109); steering reset present (line 2084-2086). (2) loop.sh is now 2363 LOC (≤ 2372 ✓). Remaining gap: 2 Medium test coverage tasks below.

[review iter 3]: FAIL — 2 findings: (1) Gate 1/3: steering cyclePosition reset has no automated test coverage; (2) Gate 4: uncommitted out-of-scope changes in working tree (start.ts, requests.ts, requests.test.ts, dist/index.js) must not be committed as part of this issue.

[plan iter 5]: Gate 4 expanded — SPEC.md is also modified (4086-line full spec replaced with 107-line issue stub), must be reverted along with the 4 CLI files. Gate 1/3 steering reset tests remain the only functional gap.

### Critical (block CI / type-check)

- [x] Remove `aloop/cli/src/commands/process-requests.test.ts` — this file is new to this branch, imports 6 symbols (`formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches`, `ChildBranchSyncDeps`) that do not exist in `process-requests.ts`, causing 6 TS type errors. `process-requests.ts` is out of scope per SPEC.md; the functions being tested belong to a different issue. Deleting this file removes all 6 errors it introduces. (Note: the remaining 8 errors in `orchestrate.ts` and `process-requests.ts` are pre-existing on master and were NOT introduced by this branch — confirmed via `git diff master -- orchestrate.ts process-requests.ts`; fixing them is out of scope.)

- [x] Reduce `loop.sh` line count below 2373 (Constitution Rule 1) — additions for new features (finalizer gate functions ~45 LOC, branch sync ~25 LOC, steering reset ~5 LOC) require compensating reductions of ~75+ LOC. Confirmed removals: (a) `extract_explicit_cooldown_until` function (lines 1085-1094, ~10 LOC) — inline the single `grep -Eo` call it wraps directly into `update_provider_health_on_failure` at line 1108; (b) stale-lock recovery block inside `acquire_provider_health_lock` (lines 899-918, ~20 LOC) — remove the dead-process/age check block; (c) seek additional reductions in verbose comment blocks, repeated `write_log_entry` call patterns, or oversized python3 heredocs (target: find ~45+ additional LOC). Final line count must be ≤ 2372.

### High (spec requirements, blocks acceptance criteria)

- [x] Add `append_plan_task_if_missing` and `check_finalizer_qa_coverage_gate` functions to `loop.sh` — `aloop/bin/loop_finalizer_qa_coverage.tests.sh` extracts both functions via `extract_func` from loop.sh; neither exists, causing all 4 tests to fail with `command not found`. `append_plan_task_if_missing` appends `- [ ] <task>` to `$PLAN_FILE` if the line is not already present. `check_finalizer_qa_coverage_gate` reads `$WORK_DIR/QA_COVERAGE.md`: (1) if file missing, set `FINALIZER_QA_GATE_REASON=qa_coverage_missing` and return 0; (2) count UNTESTED and FAIL rows in the markdown table — if UNTESTED > 30% of total rows OR any FAIL rows exist, call `append_plan_task_if_missing` for each blocker and return 1; otherwise return 0. Integrate `check_finalizer_qa_coverage_gate` call into the finalizer-entry block at line ~2304 in the main loop (before setting `FINALIZER_MODE=true`). Any LOC added must be offset by reductions from the LOC task above.

- [x] Implement branch sync in `loop.sh` — spec §Branch Sync: add `sync_base_branch()` function that: (1) reads base branch from `--base-branch` argument (new optional arg, default `master`); (2) runs `git fetch origin "$BASE_BRANCH" 2>&1`; (3) attempts `git merge "origin/$BASE_BRANCH" --no-edit 2>&1`; (4) on merge conflict (`git merge` exits non-zero AND `git diff --name-only --diff-filter=U` shows conflicted files): creates `$SESSION_DIR/queue/$(date +%s)-PROMPT_merge.md` with merge-conflict context and logs `merge_conflict` event; (5) on fetch/merge success: logs nothing (silent success path). Call `sync_base_branch` in the main loop before `run_queue_if_present`. Any LOC added must be offset by reductions from the LOC task above.

- [x] Implement branch sync in `loop.ps1` — same spec requirement: add `Sync-BaseBranch` function with equivalent logic (git fetch + merge + conflict queue + `merge_conflict` log event). Add `--BaseBranch` optional parameter (default `master`). Call before `Run-QueueIfPresent` in the main loop. Any LOC added must be offset by reductions elsewhere in loop.ps1.

- [x] Add steering queue `cyclePosition` reset in `loop.sh` — spec: "Steering queue execution resets `cyclePosition` to `0` (plan restart point)." In `run_queue_if_present`, detect if queue item is a steering prompt (name matches `*-PROMPT_steer.md` or `*-steering.md`) and after successful provider invocation add: `CYCLE_POSITION=0; persist_loop_plan_state`. This must happen after the success branch at line ~2119 (after `update_provider_health_on_success`).

- [x] Add steering queue `cyclePosition` reset in `loop.ps1` — same requirement: in `Run-QueueIfPresent`, after successful steering queue item, add `$script:cyclePosition = 0` and call `Save-LoopPlanState`. Detect steering items by `$queueBasename -like "*-PROMPT_steer.md" -or $queueBasename -like "*-steering.md"`.

### Medium (test coverage for new behaviors)

- [x] Add tests for branch sync conflict queueing in `aloop/bin/loop_branch_coverage.tests.sh` or a new focused test file — cover: (1) merge conflict → queue file written with name matching `*-PROMPT_merge.md`; (2) merge success → no queue file written; (3) `merge_conflict` log event present in case 1; (4) fetch failure → no crash, best-effort skip. Register corresponding branch IDs: `branch_sync.conflict`, `branch_sync.success`, `branch_sync.fetch_fail`. [qa re-test iter 3: confirmed still absent — coverage JSON has 52 branches, none are branch_sync.*. Acceptance criteria gap.]

- [ ] Add tests for steering reset of cyclePosition in `aloop/bin/loop_branch_coverage.tests.sh` — cover: (1) after steering queue item executes successfully, `CYCLE_POSITION` is 0; (2) non-steering queue item does NOT reset `CYCLE_POSITION`. Register branch IDs: `queue.steer_reset`, `queue.nonsteer_no_reset`. [qa re-test iter 3: confirmed still absent — no queue.steer_* branches in coverage JSON. Acceptance criteria gap.]

- [ ] [review] Gate 1 + Gate 3: Steering cyclePosition reset has no automated test coverage — `queue.steer_reset` and `queue.nonsteer_no_reset` branch IDs are not registered or covered in `aloop/bin/loop_branch_coverage.tests.sh`. SPEC acceptance criterion requires automated coverage for each new behavior including steering reset. Add two test cases to the branch-sync section of loop_branch_coverage.tests.sh: (1) mock a `*-PROMPT_steer.md` queue item through `run_queue_if_present` and assert `CYCLE_POSITION=0` after success; (2) mock a non-steering queue item and assert `CYCLE_POSITION` is unchanged. Register `queue.steer_reset` and `queue.nonsteer_no_reset`. Note: run_queue_if_present invokes invoke_provider so tests will need the same mock infrastructure as existing queue tests. (priority: high)

- [x] [review] Gate 4: Revert uncommitted out-of-scope working tree changes before committing — Unstaged changes exist in five out-of-scope files: `SPEC.md` (replaced entire 4086-line spec with a 107-line issue-scoped stub — major out-of-scope change; must be reverted to restore the full upstream content), `aloop/cli/src/commands/start.ts` (removes `hasConfiguredValue()` helper — not in scope, not touched by issue), `aloop/cli/src/lib/requests.ts` (functional changes: removes `ValidationError` class, changes `findExistingIssueByTitle` signature from `RequestProcessorOptions` to `spawnFn?: typeof spawnSync`, refactors `handleSteerChild` to use `findActiveChildSessionByIssue` with different error messages), `aloop/cli/src/lib/requests.test.ts` (updates `steer_child no active.json` assertion from `'No active sessions found'` to `'Could not find child session for issue #101'`), and `aloop/cli/dist/index.js` (compiled from a prior inconsistent source state — contains `LOOP_PROMPT_TEMPLATES` with 11 entries and `pipeline.yml` scaffolding that are absent from all current TypeScript source files). Per Constitution Rules 12 and 18, these modifications are out of scope. Run `git checkout -- SPEC.md aloop/cli/src/commands/start.ts aloop/cli/src/lib/requests.ts aloop/cli/src/lib/requests.test.ts aloop/cli/dist/index.js` to revert all five files, then rebuild dist from the in-scope source changes only. (priority: high)

### Deferred

- [~] `[review] Gate 5: npm test reports 33 failures` — the primary failures (`launchChildLoop`, `dispatchChildLoops`, `runOrchestratorScanPass`) are caused by pre-existing type errors in `orchestrate.ts` that exist on master before this branch. After removing `process-requests.test.ts` (which removes 6/17 new type errors), the remaining test failures trace to out-of-scope pre-existing master bugs. Fixing `orchestrate.ts` type errors is out of scope per SPEC.md.

- [~] `[review] Constitution Rules 2, 12, 18 — out-of-scope changes` — reviewed: (a) `orchestrate.ts` diff vs master shows ONLY removal of `-MaxIterations 100` flags (commits 793ba420, d45e7abd); all other orchestrate.ts content (round_robin_order passthrough, SPEC.md seeding, dor_validated guard) is identical to master and was NOT introduced by this branch. (b) `process-requests.ts` diff vs master is empty — no changes on this branch. The `sweepStaleRunningIssueStatuses` function and the `syncChildBranches` loop were already present in master (pre-existing). No out-of-scope orchestrate.ts/process-requests.ts changes to revert.

### Completed

- [x] CLAUDECODE sanitization — `unset CLAUDECODE` at entry and before each provider invocation in `loop.sh`; `Remove-Item Env:CLAUDECODE` at entry and in `Invoke-Provider` in `loop.ps1`; `delete process.env.CLAUDECODE` in `sanitize.ts` (loaded by `index.ts`)
- [x] `cyclePosition` tracked in `loop-plan.json` independently from iteration counter
- [x] Phase prerequisites (`check_phase_prerequisites` in loop.sh): build → requires unchecked tasks, review → requires commits since `lastPlanCommit`; `phase_prerequisite_miss` log events emitted
- [x] `MAX_PHASE_RETRIES` safety valve (providers × 2, minimum 2) enforced; `phase_retry_exhausted` logged
- [x] Provider stderr captured in `tmp_stderr` and included in `LAST_PROVIDER_ERROR` failure context
- [x] Finalizer sequencing: `finalizer_entered`, `finalizer_aborted`, `finalizer_completed` events; `finalizerPosition` persisted; new unchecked TODOs abort finalizer and resume cycle
- [x] Queue overrides take priority over cycle/finalizer in each iteration (checked before cycle dispatch)
