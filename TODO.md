# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### In Progress

- [ ] [review] Constitution Rule 1 FAIL: revert loop.sh additions from commits `777a4fba`, `2bdd235c`, `32f56f0d` — these three commits merged in from `agent/trunk` added `extract_explicit_cooldown_until()` (new function), stale lock recovery in `acquire_provider_health_lock()`, and `tmp_stdout` capture in `invoke_provider()`, growing loop.sh by 44 lines (2329→2373). Per Constitution Rule 1: "Nothing may be added to loop.sh or loop.ps1." These behaviors belong in the runtime if needed at all. Also revert the `write_log_entry "health_lock_failed"` argument compression (line 923) back to the multi-line form it had before — it was minified to partially offset the growth but makes the call unreadable. (priority: high)

### Up Next

- [x] Fix `OrchestratorIssueState` — add `'review'` to the union type in `orchestrate.ts:55` (fixes TS2367 in `process-requests.ts:532` and `:1206` where `issue.state !== 'review'` is compared against a type that doesn't include `'review'`; two identical guards in process-requests rely on this state value)

- [x] Fix `OrchestratorState` interface — add `round_robin_order?: string[]` property (fixes TS2339 at `orchestrate.ts:3483` and `:3514` where `state.round_robin_order` is accessed in `dispatchChildLoops` and `launchIssues`)

- [ ] Fix `launchChildLoop` — remove undefined `state` variable references; the function signature at `orchestrate.ts:3019` does not receive `state` as a parameter but lines 3166–3168 and 3195 access `state?.round_robin_order` and `roundRobinOrder` (also undefined in that scope). Fix: add `roundRobinOrder?: string[]` as an explicit parameter and replace `state?.round_robin_order || roundRobinOrder` with just `roundRobinOrder`. Update call sites in `launchIssues` to pass the value. This is the root cause of the 14 `launchChildLoop` test failures and 7 cascading `dispatchChildLoops` failures (ReferenceError: state is not defined).

- [ ] Fix `processQueuedPrompts` — define `provider` variable; lines 5166 and 5178 use `provider` which is not a parameter of the function (signature at `orchestrate.ts:5065` has no `provider` param). Fix: derive provider from `deps.dispatchDeps.meta?.provider` or use a hardcoded default (e.g. `'claude'`). This causes 2 `processQueuedPrompts` test failures (returns `processed: 0` instead of `processed: 1`).

- [ ] Implement scan agent self-healing & diagnostics (unimplemented SPEC.md ACs at lines 108–109):
  - Track blocker signatures across scan iterations in `orchestrator.json` or a dedicated `<session>/blockers.json`
  - After configurable threshold `N`, write `<session>/diagnostics.json` with: blocker fingerprint, first/last-seen iteration, attempted remediations
  - Write `<session>/ALERT.md` for critical blockers requiring human action
  - Auto-remediate known recoverable blockers (missing labels → call `adapter.ensureLabelExists`; missing adapter config → derive from meta.json and log)
  - Log all unknown/unhandled request types with request id, type, and file path
  - Add tests in `orchestrate.test.ts` covering: persistence threshold trigger, diagnostics.json shape, ALERT.md creation, auto-remediation of missing labels

### Completed

- [x] `aloop orchestrate` daemon launch — returns immediately with non-null pid (verified by QA: 99ms, pid non-null)
- [x] active.json registration with pid/session_dir/work_dir/mode:orchestrate (QA PASS 2026-04-17)
- [x] `--no-task-exit` included in loop.sh spawn args (QA PASS 2026-04-17)
- [x] `aloop stop` kills orchestrator process and removes from active.json (QA PASS 2026-04-17)
- [x] All 10 request types processed and routed by process-requests (PASS: unit tests + runtime QA)
- [x] Malformed/invalid request JSON → requests/failed/ with structured log entry (QA PASS 2026-04-17)
- [x] Idempotency by request id — no duplicate side effects on re-run (requests.test.ts 82/82 PASS)
- [x] EtagCache persistence to ~/.aloop/.cache/etag-cache.json (implemented)
- [x] OrchestratorAdapter used for GH operations; adapter selected from meta.json (adapter.test.ts 25/25 PASS)
- [x] No hardcoded github.com literals in orchestrator runtime code (adapter.ts uses gh CLI)
- [x] Child session liveness checks (PID + command marker; sweepStaleRunningIssueStatuses)
- [x] Resume stopped child sessions instead of creating new ones (fix: 5636c230)
- [x] process-requests.test.ts 21/21 PASS; adapter.test.ts 25/25 PASS; requests.test.ts 82/82 PASS
