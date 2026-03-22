# Sub-Spec: Issue #144 — Autonomous daemon lifecycle: spawn, register, signal handling, shutdown

## Objective

Make `aloop orchestrate` spawn a background daemon that runs indefinitely, following the same lifecycle pattern as `aloop start`.

## Scope

- `aloop orchestrate` spawns a detached background process and returns immediately (like `start.ts` does)
- Orchestrator registers in `~/.aloop/active.json` with PID, session_dir, work_dir, mode=orchestrator
- Scan loop runs indefinitely with no iteration cap (per spec: orchestrate mode defaults to no max iterations)
- Runtime coordinator (Node.js) watches `requests/` directory and processes side effects between scan iterations
- Register SIGTERM and SIGINT handlers for graceful shutdown:
  - Stop all running child loops
  - Persist final `orchestrator.json` state
  - Deregister from `active.json`
  - Exit cleanly
- `aloop stop <session-id>` sends SIGTERM to orchestrator process, triggering graceful shutdown
- Write `status.json` with mode=orchestrator, update state transitions (starting → running → stopped/completed)
- Support both Unix (bash) and note Windows (PS1) in daemon spawning

## Inputs
- `start.ts` daemon spawning pattern (detached process, stdio redirect)
- `session.mjs` active session management functions
- `stop.ts` existing stop command

## Outputs
- Updated `orchestrate.ts` with daemon lifecycle
- Updated `stop.ts` to handle orchestrator sessions
- Signal handler registration and graceful shutdown logic

## Acceptance Criteria
- [ ] `aloop orchestrate` spawns background daemon and returns immediately
- [ ] Orchestrator registers in `active.json` with correct metadata
- [ ] Scan loop runs indefinitely until all issues resolved or user stops
- [ ] `aloop stop <id>` gracefully shuts down orchestrator
- [ ] Orchestrator deregisters from `active.json` on exit
- [ ] Child loops are stopped during shutdown
- [ ] `status.json` reflects orchestrator state transitions

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
