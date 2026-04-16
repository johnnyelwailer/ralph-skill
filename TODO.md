# Issue #23: Epic: Inner Loop Engine — Phase Control, Retry & Finalizer

## Tasks

### Critical (block CI / type-check)

- [x] Remove `aloop/cli/src/commands/process-requests.test.ts` — this file is new to this branch, imports 6 symbols (`formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches`, `ChildBranchSyncDeps`) that do not exist in `process-requests.ts`, causing 6 TS type errors. `process-requests.ts` is out of scope per SPEC.md; the functions being tested belong to a different issue. Deleting this file removes all 6 errors it introduces. (Note: the remaining 8 errors in `orchestrate.ts` and `process-requests.ts` are pre-existing on master and were NOT introduced by this branch — confirmed via `git diff master -- orchestrate.ts process-requests.ts`; fixing them is out of scope.)

- [ ] Fix `loop.sh` Constitution Rule 1 violation — commits 777a4fba (+36 LOC), 32f56f0d (+5 LOC), and 2bdd235c (+27 LOC) added `extract_explicit_cooldown_until`, stale-lock recovery in `acquire_provider_health_lock`, and `tmp_stdout` capture. Only `tmp_stdout` capture is spec-required ("provider stderr/context preserved in failure logs"). Remove `extract_explicit_cooldown_until` (lines ~1085-1130) and the stale-lock recovery block inside `acquire_provider_health_lock` (~lines 882-1000), and find other LOC reductions to ensure net line count is strictly lower than the current 2373 LOC. Keep `tmp_stdout` capture as it implements the spec requirement.

### High (spec requirements, blocks acceptance criteria)

- [ ] Add `check_finalizer_qa_coverage_gate` and `append_plan_task_if_missing` functions to `loop.sh` — `aloop/bin/loop_finalizer_qa_coverage.tests.sh` references both functions but neither exists, causing all 4 tests to fail with `command not found`. `check_finalizer_qa_coverage_gate` reads `$WORK_DIR/QA_COVERAGE.md`, returns 0 (pass) if `<=30%` UNTESTED rows and no FAIL rows, otherwise calls `append_plan_task_if_missing` to add blocking tasks to `$PLAN_FILE`. Must be integrated into finalizer pre-check in the main loop. Any LOC added must be offset by reductions elsewhere in loop.sh.

- [ ] Implement branch sync in `loop.sh` — spec §Branch Sync: before each iteration, run `git fetch origin <base_branch>` and merge into current branch. On merge conflict: write `PROMPT_merge.md` into `$SESSION_DIR/queue/` and emit `merge_conflict` log event. No semantic conflict resolution — mechanical queue only. Must be called before `run_queue_if_present` check in the iteration loop. Any LOC added must be offset by reductions elsewhere.

- [ ] Implement branch sync in `loop.ps1` — same spec requirement as loop.sh: pre-iteration `git fetch` + merge + conflict queueing + `merge_conflict` event. Equivalent PowerShell implementation. Any LOC added must be offset by reductions.

- [ ] Add steering queue `cyclePosition` reset in `loop.sh` — spec: "Steering queue execution resets `cyclePosition` to `0` (plan restart point)." Currently the `run_queue_if_present` function processes steering prompts (`*-PROMPT_steer.md`, `*-steering.md`) without resetting `CYCLE_POSITION`. After a successful steering execution, set `CYCLE_POSITION=0` and persist to loop-plan.json.

- [ ] Add steering queue `cyclePosition` reset in `loop.ps1` — same requirement: after successful steering queue item, set `$script:cyclePosition = 0` and persist.

### Medium (test coverage for new behaviors)

- [ ] Add tests for branch sync conflict queueing in `aloop/bin/loop_branch_coverage.tests.sh` or a new focused test file — cover: merge conflict → queue file written, merge success → no queue file, `merge_conflict` log event present.

- [ ] Add tests for steering reset of cyclePosition in existing test files — cover: after steering queue item executes, `cyclePosition` in loop-plan.json is 0.

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
