# Issue #144: Autonomous daemon lifecycle: spawn, register, signal handling, shutdown

## Current Phase: Implementation

### Analysis Summary

The orchestrator already spawns loop.sh as a detached background process and registers in
active.json (orchestrate.ts:1333-1424). The runtime coordinator pattern is implemented via
process-requests.ts called by loop.sh between iterations. Key gaps are around signal handling,
graceful shutdown with child loop cleanup, status.json state transitions, and SIGTERM trap in
loop.sh.

### In Progress

### Up Next

- [ ] Add SIGTERM trap to loop.sh for graceful shutdown (priority: critical)
  loop.sh only traps INT (line 2111), not TERM. When `aloop stop` sends SIGTERM via
  session.mjs:killProcess(), loop.sh is killed without cleanup — no status.json update,
  no session lock removal, no report generation. Add: `trap 'cleanup "terminated" "stopped"; exit 143' TERM`

- [x] Write status.json for orchestrator session at startup (priority: critical)
  orchestrateCommand() writes meta.json and registers in active.json, but never writes
  status.json. Without it, `aloop status` and the dashboard show "unknown" state for
  orchestrator sessions. Write `{ state: "running", mode: "orchestrate", ... }` alongside
  meta.json at orchestrate.ts:1385.

- [ ] Stop child loops during orchestrator shutdown (priority: critical)
  When orchestrator stops, child loops (spawned via dispatchChildLoop) keep running orphaned.
  stopSession() in session.mjs only kills the main PID. Need to: read orchestrator.json to
  find child sessions, call stopSession() for each active child before deregistering the
  orchestrator. This goes in session.mjs:stopSession() — detect mode=orchestrate and cascade.

- [ ] Update stopSession to handle orchestrator mode cascade (priority: high)
  session.mjs:stopSession() needs orchestrator-awareness: if the stopped session has
  mode=orchestrate in active.json, read orchestrator.json from session_dir, iterate
  state.issues with child_session set, and stop each child session before stopping the
  orchestrator itself. Also persist final orchestrator.json state with updated_at.

- [ ] Update status.json state transitions throughout orchestrator lifecycle (priority: high)
  Track state transitions: starting → running → stopped/completed. process-requests.ts
  should update status.json to "running" with iteration count after each scan pass.
  On all-done, set state to "completed". On stop, set state to "stopped" (already done
  by stopSession, but only if status.json exists).

- [ ] Remove hardcoded max-iterations 999999, use no cap for orchestrate mode (priority: medium)
  orchestrateCommand() spawns loop.sh with `--max-iterations 999999` (line 1365). Per spec,
  orchestrate mode should have no iteration cap. Either pass a very large sentinel or add
  `--no-max-iterations` flag to loop.sh. The scan loop already supports infinite via the
  `while [ "$ITERATION" -lt "$MAX_ITERATIONS" ]` pattern — just need a sufficiently large
  value or Infinity handling.

- [ ] Add orchestrate.test.ts coverage for daemon lifecycle (priority: medium)
  Existing tests cover orchestrateCommandWithDeps (state initialization) but not the daemon
  spawning in orchestrateCommand(). Add tests for: status.json written at startup, SIGTERM
  cascade stops children, stopSession handles orchestrator mode, status transitions.

### Deferred

- [ ] Windows (PS1) daemon spawning support
  TASK_SPEC mentions "note Windows (PS1) in daemon spawning". Current spawning code uses
  platform-specific logic in start.ts but orchestrate.ts only spawns loop.sh (Unix).
  Defer until Unix path is solid.

### Completed
