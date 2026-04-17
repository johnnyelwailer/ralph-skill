# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### In Progress

### Up Next

- [ ] [qa/P1] launchChildLoop crashes with ReferenceError: `state` not defined at orchestrate.ts:3166: Called `aloop orchestrate` → loop spawns and runs, but `launchChildLoop` inside orchestrate.ts references `state`, `roundRobinOrder`, and `provider` variables that are out of scope (ReferenceError at runtime). TypeScript type-check confirms with TS2304 `state`×3, TS2552 `roundRobinOrder`, TS2339 `round_robin_order`×2, TS2304 `provider`×2. Causes 14+ test failures in orchestrate.test.ts (`launchChildLoop` and `dispatchChildLoops` suites). Likely introduced in recent orchestrate.ts edits. Tested at iter 1. (priority: high)

- [ ] [qa/P1] processQueuedPrompts returns 0 processed items (expect 1): Two orchestrate.test.ts tests fail with `0 !== 1` at result.processed — "uses sessionDir as work-dir for spec-consistency-check.md" and "uses projectRoot as work-dir for non-consistency queue files". Function returns no processed count when items are queued. Tested at iter 1. (priority: high)

- [ ] [qa/P1] CLI type-check FAIL (9 errors, up from 2): `bun run type-check` exits code 2 with 9 errors — 8 new in orchestrate.ts (TS2304/TS2552/TS2339 for undefined variables `state`, `roundRobinOrder`, `round_robin_order`, `provider`) plus the pre-existing TS2367 in process-requests.ts:532. Situation worsened from previous QA session. Tested at iter 1. (priority: high)

- [x] **[priority: critical] Fix syntax bug: `isChildSessionAlive` missing closing `}` in `process-requests.ts`**

  In `aloop/cli/src/commands/process-requests.ts` at line ~156, the `isChildSessionAlive` function
  is missing its closing `}`. This causes `sweepStaleRunningIssueStatuses` (declared at line 159) to
  be nested inside `isChildSessionAlive` instead of being a module-level function. Because of this,
  the call to `sweepStaleRunningIssueStatuses(aloopRoot)` at line 934 (inside `processRequestsCommand`)
  is out of scope and would cause a runtime/TypeScript error.

  Fix: insert `}` after line 156 to close `isChildSessionAlive`, and remove the spurious second `}`
  at line 190 (currently closing the outer function). Add a regression test in
  `process-requests.test.ts` that calls `processRequestsCommand` with a stale child session status to
  confirm the sweep runs without error.

- [ ] **Add tests for `orchestrateCommand` daemon launch path (lifecycle ACs)**

  All existing tests in `orchestrate.test.ts` under `describe('orchestrateCommand')` use
  `planOnly: true`, which bypasses the daemon-launch code entirely. The spec requires these acceptance
  criteria to be test-covered:
  - AC: `aloop orchestrate --output json` returns immediately with a non-null `pid`
  - AC: `active.json` contains an entry with `pid`, `session_dir`, `work_dir`, `mode: "orchestrate"`
  - AC: spawn args include `--no-task-exit`

  Add tests to `orchestrate.test.ts` that mock `spawn`/`spawnSync` (similar to `launchChildLoop`
  mock patterns at line ~2340). Verify the JSON output includes `pid !== null`, verify `active.json`
  is written with the correct fields, and verify that `--no-task-exit` appears in the spawn args.
  Also add a test for the `--resume` path that confirms `active.json` is updated with `mode:
  "orchestrate"`.

- [ ] **Implement blocker persistence diagnostics and self-healing**

  The spec requires scan-agent self-healing and diagnostics that are entirely missing:
  - Persist blocker signatures (by fingerprint) across scan iterations in orchestrator state
  - After configurable threshold `N` iterations with same blocker, write
    `<session>/diagnostics.json` with blocker fingerprint, `first_seen_iteration`,
    `last_seen_iteration`, and `attempted_remediations`
  - Write `<session>/ALERT.md` for critical blockers requiring human action
  - Self-heal known recoverable blockers: missing labels (call
    `adapter.ensureLabelExists`), missing adapter config derivable from session metadata (default to
    `github` adapter type, log remediation)
  - Log unknown/unhandled request types in `processAgentRequests` with request `id`, `type`, and
    file path (currently only an untyped error is thrown — add structured log entry before
    the throw/archive)

  Implementation guidance:
  - Add `blocker_signatures: Record<string, { first_seen: number; last_seen: number; count: number; remediations: string[] }>` to `OrchestratorState`
  - Add `blockerPersistenceThreshold` config (default: 3 iterations) read from `meta.json` or hardcoded constant
  - Add `writeBlockerDiagnostics(sessionDir, signature, details)` and `writeBlockerAlert(sessionDir, body)` helper functions in `orchestrate.ts`
  - Wire into `runOrchestratorScanPass`: detect known blockers (label missing, adapter not configured), track counts, trigger diagnostics/alert/remediation

  Add tests in `orchestrate.test.ts` covering:
  - Blocker count increments across iterations
  - `diagnostics.json` is written after threshold N
  - `ALERT.md` is written for critical blockers
  - Self-healing: `ensureLabelExists` called for missing label blocker
  - Remediation logged in orchestrator state
  Add test in `requests.test.ts` for unknown request type logging (structured log entry present in log).

### Completed

- [x] `orchestrateCommand` launches detached daemon and returns immediately
      (verified: spawn with `detached: true`, `child.unref()` in orchestrate.ts ~line 1553)
- [x] Session registered in `active.json` with `pid`, `session_dir`, `work_dir`, `mode: "orchestrate"`
      (verified: active[sessionId] written at orchestrate.ts ~line 1596-1606)
- [x] Loop invocation includes `--no-task-exit`
      (verified: orchestrate.ts lines 1442, 1550)
- [x] `aloop stop` stops the orchestrator process and removes from `active.json`
      (verified: session.mjs `stopSession` kills PID and removes entry from active.json)
- [x] All 10 request types processed with validation, failed/ routing, idempotency
      (verified: requests.ts `processAgentRequests` + `handleRequest` switch covering all types)
- [x] Malformed/invalid requests moved to `requests/failed/`
      (verified: requests.ts `processAgentRequests` validation failure path)
- [x] Request ID idempotency via `processed-ids.json`
      (verified: requests.ts + test at `processAgentRequests - request ID idempotency`)
- [x] `EtagCache` loaded before scan pass and saved after pass
      (verified: process-requests.ts lines 983-984)
- [x] `OrchestratorAdapter` and `GitHubAdapter` implemented
      (verified: adapter.ts)
- [x] Adapter selection from `meta.json`; default is `github`
      (verified: `resolveAdapterConfig` in process-requests.ts + tests at lines 417-443)
- [x] No hardcoded `github.com` literals for API host selection
      (verified: grep found only comment references)
- [x] `adapter.test.ts` covers all GitHubAdapter operations including GHE URLs
      (verified: adapter.test.ts lines 37-369)
- [x] `requests.test.ts` covers all request types, validation, and idempotency
      (verified: requests.test.ts 1700+ lines of tests)
- [x] `process-requests.test.ts` covers syncChildBranches, processCrResultFiles, syncMasterToTrunk, resolveAdapterConfig
      (verified: process-requests.test.ts)
