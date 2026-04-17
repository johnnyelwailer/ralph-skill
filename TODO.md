# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### In Progress

- [x] [review] Constitution Rule 1 FAIL: revert loop.sh additions from commits `777a4fba`, `2bdd235c`, `32f56f0d` — these three commits merged in from `agent/trunk` added `extract_explicit_cooldown_until()` (new function), stale lock recovery in `acquire_provider_health_lock()`, and `tmp_stdout` capture in `invoke_provider()`, growing loop.sh by 44 lines (2329→2373). Per Constitution Rule 1: "Nothing may be added to loop.sh or loop.ps1." These behaviors belong in the runtime if needed at all. Also revert the `write_log_entry "health_lock_failed"` argument compression (line 923) back to the multi-line form it had before — it was minified to partially offset the growth but makes the call unreadable. (priority: high)

### Up Next

- [x] Fix `OrchestratorIssueState` — add `'review'` to the union type in `orchestrate.ts:55` (fixes TS2367 in `process-requests.ts:532` and `:1206` where `issue.state !== 'review'` is compared against a type that doesn't include `'review'`; two identical guards in process-requests rely on this state value)

- [x] Fix `OrchestratorState` interface — add `round_robin_order?: string[]` property (fixes TS2339 at `orchestrate.ts:3483` and `:3514` where `state.round_robin_order` is accessed in `dispatchChildLoops` and `launchIssues`)

- [x] Fix `launchChildLoop` — verified: `roundRobinOrder?: string[]` is already a parameter at `orchestrate.ts:3029`; `state?.round_robin_order` and `roundRobinOrder` references at lines 3169, 3198, 3206 are properly scoped with fallback defaults. No undefined references remain.

- [ ] Fix `processQueuedPrompts` call site — function signature at `orchestrate.ts:5073` already has `provider` param with default `'round-robin'`, but the call site at `orchestrate.ts:5549` omits the 6th argument so provider always defaults to `'round-robin'` regardless of the actual provider in use. Fix: pass the provider from `deps.dispatchDeps.meta?.provider` (or equivalent) at the call site.

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
