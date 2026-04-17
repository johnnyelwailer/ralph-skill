# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

# Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Objective
Make orchestrator sessions fully autonomous and long-running, with runtime-owned request execution and backend abstraction, while preserving the `aloop` trust boundary and lifecycle guarantees.

This issue delivers:
- `aloop orchestrate` lifecycle parity with `aloop start` (background daemon, active session registration, stoppable via `aloop stop`)
- Runtime-side processing of all orchestrator request types with validation, failure routing, and idempotency
- Adapter-driven issue/PR/comment operations (no orchestrator-side direct GH CLI coupling)
- Blocker persistence diagnostics and self-healing for known recoverable setup failures

## Architectural Context
System boundaries for this work:
- Loop runner layer: `aloop/bin/loop.sh` runs iterations and invokes `aloop process-requests`; it must remain a thin runner (Constitution Architecture #1).
- Orchestrator runtime layer: `aloop/cli/src/commands/orchestrate.ts` owns session bootstrap/resume, daemon launch, prompt/queue/request dirs, and `active.json` registration.
- Request execution layer: `aloop/cli/src/commands/process-requests.ts` owns runtime side effects (GH operations, child dispatch/stop, queue writes, state transitions), never the scan agent or loop scripts (Constitution Architecture #2, #4, #5).
- Request contract layer: `aloop/cli/src/lib/requests.ts` owns schema validation, idempotency tracking, and request-type dispatch.
- Backend abstraction layer: `aloop/cli/src/lib/adapter.ts` defines `OrchestratorAdapter` and concrete GitHub implementation.
- Runtime state and caches: `<session>/orchestrator.json`, `<session>/meta.json`, `<session>/requests/*`, `<session>/queue/*`, `~/.aloop/active.json`, `~/.aloop/.cache/etag-cache.json`.

## Scope
In-scope modifications:
- `aloop/cli/src/commands/orchestrate.ts`
- `aloop/cli/src/commands/process-requests.ts`
- `aloop/cli/src/lib/requests.ts`
- `aloop/cli/src/lib/adapter.ts`
- `aloop/cli/src/commands/orchestrate.test.ts`
- `aloop/cli/src/commands/process-requests.test.ts`
- `aloop/cli/src/lib/requests.test.ts`
- `aloop/cli/src/lib/adapter.test.ts`
- `aloop/cli/lib/session.mjs` and `aloop/cli/src/commands/session.ts` only if required to guarantee orchestrator stop/deregister behavior.
- `aloop/bin/loop.sh` only for orchestrator runner wiring (`--no-task-exit`, process-requests invocation), not business logic.

## Out of Scope
Do NOT modify:
- Agent prompt semantics beyond output contracts for this epic (Constitution Scope Control #12, #19).
- Provider CLIs/integrations (`claude`, `codex`, `gemini`, `copilot`, `opencode`) or unrelated session UX flows.
- Dashboard UI redesign; only correctness updates are allowed if strictly required for orchestrator visibility.
- Business logic in `loop.sh`/`loop.ps1` (Constitution Architecture #1).
- Any agent-side direct GH/network/`aloop` execution paths (Constitution Architecture #4).
- Broad refactors outside touched files (Constitution Scope Control #18, #21).

## Constraints
Non-negotiable constraints for implementation:
- Keep loop scripts as dumb runners; host-side side effects must stay in runtime commands (`orchestrate.ts`, `process-requests.ts`) (Constitution Architecture #1, #2).
- Agents remain untrusted; all external side effects must flow through runtime request contracts (Constitution Architecture #4, #5).
- Preserve data-driven behavior; avoid hardcoded backend host assumptions and prompt/phase coupling in runtime logic (Constitution Architecture #6, Code Quality #15).
- Validate request payloads at boundaries and route malformed input to failure paths (Constitution Code Quality #17).
- Maintain small focused modules and add/extend tests for each changed behavior (Constitution Design #7, #8, #11).
- Keep this epic scoped to orchestrator lifecycle/request pipeline concerns only (Constitution Scope Control #12, #19).

## Deliverables
### Autonomous Lifecycle
- `aloop orchestrate` launches detached daemon and returns immediately.
- Session is registered in `active.json` with `pid`, `session_dir`, and `work_dir`.
- Orchestrator loop runs via `loop.sh` with `PROMPT_orch_scan.md` and `--no-task-exit`.
- Runtime coordinator (`process-requests`) executes side effects between loop iterations.
- SIGTERM/SIGINT handling allows graceful shutdown via `aloop stop`.
- Session deregisters from `active.json` on stop/exit.
- Orchestrator session is visible in status/dashboard flows.

### Request Processing (All Types)
`process-requests` must process and route all request types:
- `create_issues`
- `update_issue`
- `close_issue`
- `dispatch_child`
- `merge_pr`
- `post_comment`
- `steer_child`
- `stop_child`
- `query_issues`
- `create_pr`

Also required:
- Payload validation with malformed requests moved to `requests/failed/`.
- Idempotency for each request type (`id`-based dedup + operation-specific duplicate protection).
- ETag cache persistence to `~/.aloop/.cache/etag-cache.json` via `EtagCache`.

### Adapter Pattern
- `OrchestratorAdapter` remains the runtime contract in `src/lib/adapter.ts`.
- `GitHubAdapter` wraps GH issue/PR/comment/label operations.
- Orchestrator runtime paths use adapter abstractions instead of direct `execGh`/`spawnSync('gh', ...)` calls.
- Adapter selection is configured from orchestrator metadata (`meta.json`).
- GitHub Enterprise hosts are supported; no hardcoded `github.com` assumptions in orchestrator runtime code.

### Scan Agent Self-Healing & Diagnostics
- Persist blocker signatures across scan iterations.
- After configurable persistence threshold `N`, write `<session>/diagnostics.json` with blocker fingerprint, first/last-seen iterations, and attempted remediations.
- Self-heal known recoverable blockers (missing labels, missing adapter config derivable from session metadata).
- Write `<session>/ALERT.md` for critical blockers requiring human action.
- Unknown/unhandled request types are logged with request id, type, and file path.

## Acceptance Criteria
- [ ] Running `aloop orchestrate --output json` returns immediately with a non-null `pid`, and does not block on scan completion.
- [ ] After orchestrate launch, `~/.aloop/active.json` contains an entry for the orchestrator session with `pid`, `session_dir`, `work_dir`, and `mode: "orchestrate"`.
- [ ] `aloop/bin/loop.sh` invocation for orchestrator sessions includes `--no-task-exit`, and loop completion is controlled by runtime state rather than TODO task exit.
- [ ] `aloop stop <session_id>` stops the orchestrator process and removes that session key from `~/.aloop/active.json`.
- [ ] For each request type in this issue, placing a valid request JSON in `<session>/requests/` and running `aloop process-requests --session-dir <session>` results in exactly one side effect and archives the file to `requests/processed/`.
- [ ] Malformed/invalid request JSON files are moved to `requests/failed/` with a logged validation error.
- [ ] Re-running `process-requests` with the same request id does not duplicate side effects (idempotency proven by tests).
- [ ] `EtagCache` is loaded before scan pass and saved after pass; cache file exists at `~/.aloop/.cache/etag-cache.json`.
- [ ] Orchestrator runtime code paths use `OrchestratorAdapter` for GH operations; direct GH CLI calls remain only in adapter implementation or explicitly documented bootstrap exceptions.
- [ ] Adapter selection comes from `meta.json`; default adapter is explicit and test-covered.
- [ ] Runtime code contains no hardcoded `github.com` literals for API host selection.
- [ ] Blocker persistence counter triggers `diagnostics.json` creation after threshold `N` and writes `ALERT.md` for critical blockers.
- [ ] Missing labels/config blockers are auto-remediated when safe, and remediation actions are logged.
- [ ] Added/updated tests in `orchestrate.test.ts`, `process-requests.test.ts`, `requests.test.ts`, and `adapter.test.ts` cover lifecycle, request routing, idempotency, adapter selection, and diagnostics behavior.

## Aloop Metadata
- Wave: 2
- Type: vertical-slice
- Dependencies: none
- File hints:
  - `aloop/cli/src/commands/orchestrate.ts`
  - `aloop/cli/src/commands/process-requests.ts`
  - `aloop/cli/src/lib/requests.ts`
  - `aloop/cli/src/lib/adapter.ts`

