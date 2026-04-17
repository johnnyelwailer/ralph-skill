# Issue #23: Epic: Inner Loop Engine — Phase Control, Retry & Finalizer

## Tasks

### In Progress
_(none)_

### Up Next

_(none)_

### Completed

- [x] cyclePosition tracked independently from iteration counter in loop-plan.json (both shells)
- [x] Failed iterations keep cyclePosition unchanged; MAX_PHASE_RETRIES (providers × 2, min 2) enforced; phase_retry_exhausted logged after exhaustion (both shells)
- [x] Build prerequisite: TODO.md checked for unchecked tasks, missing/empty forces plan + logs phase_prerequisite_miss reason=no_tasks (both shells)
- [x] Review prerequisite: commits since lastPlanCommit checked, missing forces build + logs phase_prerequisite_miss reason=no_builds (both shells)
- [x] Provider stderr captured in tmp file and included in iteration failure log context (both shells)
- [x] Queue override executes before cycle/finalizer selection each iteration (both shells)
- [x] Steering queue execution resets cyclePosition to 0; non-steering queue preserves it (both shells)
- [x] Finalizer[] consumed from loop-plan.json; finalizerPosition persisted; entry only at cycle boundary when allTasksMarkedDone; abort on new unchecked TODOs; only last finalizer with zero new TODOs sets state=completed; finalizer_entered/finalizer_aborted/finalizer_completed events emitted (both shells)
- [x] CLAUDECODE sanitized at all 3 entry points: loop.sh (unset at entry + env -u on provider invocations), loop.ps1 (Remove-Item at entry), cli/src/sanitize.ts (delete process.env.CLAUDECODE)
- [x] Pre-iteration branch sync: sync_base_branch() / Sync-BaseBranch runs each iteration; conflicts queue PROMPT_merge.md and log merge_conflict (both shells)
- [x] loop.sh --no-task-exit flag: NO_TASK_EXIT=true bypasses check_all_tasks_done()
- [x] orchestrate.ts: passes --no-task-exit to orchestrator loop args (both Linux and Windows paths); removed hardcoded -MaxIterations 100 from launchChildLoop
- [x] loop.sh: reads max_iterations from loop-plan.json or ALOOP_MAX_ITERATIONS env; unlimited when both absent
- [x] loop.ps1: reads max_iterations from loop-plan.json or ALOOP_MAX_ITERATIONS env; unlimited when both absent (MaxIterations=0 default)
- [x] loop.ps1: fixed Test-Path bug (now reads from $lpf file path, not env var string)
- [x] loop.ps1: fixed false limit_reached log (guarded with $MaxIterations -gt 0)
- [x] loop_branch_coverage.tests.sh: max_iterations.env_var, max_iterations.plan_file, max_iterations.unset_no_file tests added
- [x] loop_branch_coverage.tests.sh: queue.steer_reset and queue.nonsteer_no_reset tests added
- [x] loop_branch_coverage.tests.sh: branch_sync.conflict, branch_sync.success, branch_sync.fetch_fail tests added
- [x] loop_finalizer_qa_coverage.tests.sh: 5/5 PASS (append_plan_task_if_missing + check_finalizer_qa_coverage_gate implemented)
- [x] loop.sh: net LOC reduction vs master (2373 → 2367, −6)
- [x] loop.ps1: -NoTaskExit switch added; Check-AllTasksComplete returns false immediately when set; net LOC reduction vs master (2273 → 2272, −1)
- [x] loop_branch_coverage.tests.sh: no_task_exit.skips_done_check and no_task_exit.default_off tests added (62/62 100% coverage)
- [x] loop.tests.ps1: NoTaskExit Check-AllTasksComplete bypass tests added for PS1 parity
