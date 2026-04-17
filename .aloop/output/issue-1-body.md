## Scope

Harden the inner loop (`loop.sh` / `loop.ps1`) with the full spec-compliant mechanics:

- **Cycle/Finalizer state machine**: `cycle[]` + `finalizer[]` arrays in `loop-plan.json`, `cyclePosition` / `finalizerPosition` tracking, `allTasksMarkedDone` flag. Loop exits ONLY when the last finalizer agent completes with zero new TODOs. Log events: `finalizer_entered`, `finalizer_aborted`, `finalizer_completed`.
- **Phase Advancement Only on Success**: `cyclePosition` increments only on successful iterations. Failed iterations retry the same phase with the next round-robin provider. `MAX_PHASE_RETRIES = len(providers) * 2` before forced advancement with `phase_retry_exhausted` log.
- **Phase prerequisites**: Build requires `TODO.md` with unchecked tasks (else force plan). Review requires commits since last plan (else force build). Log as `phase_prerequisite_miss`.
- **Queue-first priority**: Queue files override cycle/finalizer position without advancing `cyclePosition`.
- **Provider stderr capture**: Capture stderr separately in `Invoke-Provider` / `invoke_provider` for failure classification.
- **CLAUDECODE sanitization**: Unset `CLAUDECODE` at script top AND inside each provider invocation block (defense-in-depth) in both `loop.sh` and `loop.ps1`.
- **Run ID rotation**: Each session run logs a unique `run_id` in all `log.jsonl` entries.
- **Per-iteration timeout precedence**: prompt frontmatter `timeout` → `ALOOP_PROVIDER_TIMEOUT` → built-in default (identical in both scripts).
- **Child PID tracking**: Track and kill spawned child processes on loop exit (`finally`/`trap`).

## Acceptance Criteria

- [ ] Loop NEVER exits mid-cycle — only at cycle boundary via finalizer
- [ ] `allTasksMarkedDone` checked only at cycle boundary (after last cycle agent)
- [ ] Switching to `finalizer[]` at cycle boundary when all tasks done
- [ ] After each finalizer agent: re-check TODO.md — new TODOs abort finalizer (`finalizerPosition` resets to 0) and resume cycle
- [ ] Only last finalizer agent completing with zero new TODOs sets `state: completed`
- [ ] Steering (queue) takes priority over finalizer
- [ ] `finalizer_entered`, `finalizer_aborted`, `finalizer_completed` events logged to `log.jsonl`
- [ ] Failed iterations do NOT advance `cyclePosition`
- [ ] Retry-same-phase uses next round-robin provider
- [ ] Build phase forces plan when no unchecked TODO.md tasks; logged as `phase_prerequisite_miss`
- [ ] Review phase forces build when no commits since last plan; logged as `phase_prerequisite_miss`
- [ ] After `MAX_PHASE_RETRIES` consecutive failures, advance with `phase_retry_exhausted` log
- [ ] Provider stderr captured and included in failure log entries
- [ ] `CLAUDECODE` unset at top of both loop scripts and in each provider invocation block
- [ ] Both `loop.sh` and `loop.ps1` implement all mechanics identically
- [ ] Tests cover cycle/finalizer state machine and phase-retry logic

## Architectural Context

This epic touches **only** `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` (inner loop layer). These are dumb runners — no business logic, no GH calls, no request processing. All state is mediated via `loop-plan.json` (runtime → loop) and `status.json` / `log.jsonl` (loop → runtime). The loop has no knowledge of what agents do — it reads filenames from `cycle[]` / `finalizer[]` and invokes providers.

**Constitution rules cited:**
- Rule 1: loop.sh/loop.ps1 are dumb runners — no business logic
- Rule 3: The loop never exits mid-cycle
- Rule 6: 100% data-driven — loop reads `loop-plan.json`, knows nothing about prompt names
- Rule 11: Every feature needs tests
- Rule 15: No hardcoded values — timeouts must come from config

## Dependencies

None (foundational epic — all others depend on this).
