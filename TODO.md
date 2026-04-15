# Issue #1: Loop Engine: Finalizer Chain, Retry-Same-Phase & Phase Guards

## Tasks

### Up Next

- [x] Add `allTasksMarkedDone: false` to the initial loop-plan.json emitted by `compile-loop-plan.ts` — the LoopPlan interface in that file is missing this field, and the generated plan omits it. Spec says loop-plan.json must contain this field. Fix: (1) add `allTasksMarkedDone: boolean` to the local `LoopPlan` interface in `aloop/cli/src/commands/compile-loop-plan.ts`, (2) include `allTasksMarkedDone: false` in the `plan` object before writing, (3) add an assertion to `compile-loop-plan.test.ts` verifying `plan.allTasksMarkedDone === false`.

### Completed

- [x] `loop-plan.json` cycle[], finalizer[], cyclePosition, finalizerPosition, iteration, version — all present (compile-loop-plan.ts writes them; loop scripts persist them)
- [x] Loop never exits mid-cycle — verified in both loop.sh and loop.ps1
- [x] allTasksMarkedDone checked only at cycle boundary (after advance resets cyclePosition to 0)
- [x] Switch to finalizer[] when all tasks done at cycle boundary — `finalizer_entered` logged
- [x] After each finalizer step, TODO.md re-checked; new TODOs reset finalizerPosition and resume cycle; `finalizer_aborted` logged
- [x] Only last finalizer completing with zero new TODOs sets state: completed; `finalizer_completed` logged
- [x] Failed iterations do NOT advance cyclePosition; retry same phase with next round-robin provider
- [x] After MAX_PHASE_RETRIES consecutive failures, advance anyway; `phase_retry_exhausted` logged
- [x] Build phase prerequisite: checks for unchecked tasks; missing → forces plan; `phase_prerequisite_miss` logged
- [x] Review phase prerequisite: checks commits since last plan; missing → forces build; `phase_prerequisite_miss` logged
- [x] Queue overrides take priority and do NOT advance cyclePosition
- [x] CLAUDECODE unset at top of loop.sh (line 20) and loop.ps1 (lines 56-58)
- [x] `delete process.env.CLAUDECODE` at aloop/cli/src/index.ts entry (line 1)
- [x] Defense-in-depth: invoke_provider (sh) uses `env -u CLAUDECODE`; Invoke-Provider (ps1) removes/restores CLAUDECODE around each provider call
- [x] PID lockfile (session.lock) created on start, stale-PID checked, cleaned up in trap/finally
- [x] Every agent commit includes Aloop-Agent, Aloop-Iteration, Aloop-Session provenance trailers via prepare-commit-msg hook
- [x] Provider stderr captured separately (tmp_stderr) and included in failure log entries (LAST_PROVIDER_ERROR / error field)
- [x] Per-iteration timeout: frontmatter `timeout` > ALOOP_PROVIDER_TIMEOUT > built-in default (10800s) — same in both scripts
- [x] Child PIDs tracked (ACTIVE_PROVIDER_PID / activeProviderProcess); killed in EXIT trap / finally block
