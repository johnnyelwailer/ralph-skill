# TDD Vertical Slice Plan

Working implementation plan derived from the delivery plan and current code state.

This document is not spec. The source of truth remains the spec and the delivery plan.

## Current state audit

### M1 — Scaffolding + daemon skeleton + health

Status: mostly implemented.

- Workspace packaging, Bun scripts, and CI scaffolding exist.
- `aloopd` exists and starts HTTP plus unix socket listeners.
- PID lock handling exists.
- `GET /v1/daemon/health` exists with tests.

Gaps against milestone intent:

- Need clean-clone verification as part of the TDD baseline, including workspace install.
- The original milestone called for an SSE echo proof endpoint. The repo has SSE endpoints, but the exact “echo” proof path is not the current controlling slice.

### M2 — State store + event log + drift detection

Status: substantially implemented.

- SQLite migrations and `StateStore`-like registries exist.
- JSONL event logging and projector-backed append path exist.
- Welford and CUSUM implementations exist with tests.
- Replay-oriented helpers and projector coverage exist.

Gaps against milestone intent:

- Need one explicit clean end-to-end replay proof for a user-observable slice, not just unit coverage.
- Need the future runner slice to prove that replay reconstructs session-visible state, not only registry tables.

### M3 — Workspace/project registry + config + compile step

Status: mostly implemented, but not yet closed into runtime execution.

- Workspace and project CRUD endpoints exist.
- Project state includes `setup_pending` and archive handling.
- Config store and reload path exist.
- `pipeline.yml` parsing and `LoopPlan` compilation exist.

Gaps against milestone intent:

- The compile path currently exists as library functionality; the audit did not find a runtime path that writes and then consumes per-project `loop-plan.json` for session execution.
- Need a vertical test that proves project config change -> reload -> compiled plan used by execution.

### M4 — Scheduler + permits + overrides

Status: mostly implemented.

- Permit acquisition, release, expiry, limits updates, provider overrides, and watchdog coverage exist.
- HTTP integration tests for scheduler and provider override routes pass after refreshing workspace installs.

Gaps against milestone intent:

- The scheduler is proven in isolation, but not yet as part of a real session runner turn.
- Burn-rate and quota behavior need runner-driven evidence once M6 exists.

### M5 — First provider adapter + `aloop-agent` + environment hardening

Status: partially implemented.

- `ProviderAdapter` interface exists.
- Opencode adapter exists and is tested.
- Provider registry and health store exist.

Gaps against milestone intent:

- No `aloop-agent` CLI implementation found.
- No verified `AUTH_HANDLE` lifecycle found in the execution path.
- No evidence of the full environment hardening/rate-limit contract around an agent CLI boundary.
- Current provider slice is adapter-level, not end-to-end session-turn execution.

### M6 — Session runner + quick-fix workflow + shims

Status: first minimal runner slice implemented.

- Session CRUD, steering queue, log streaming, and resume/pause endpoints exist.
- Session turn chunk replay endpoint exists.
- Minimal daemon-owned runner now exists for agent-only compiled plans.
- Session creation and resume can trigger background execution.
- Session-local `loop-plan.json` is compiled and written.
- Session-local `agent.chunk` events are persisted and replayable from `log.jsonl`.
- A shipped `quick-fix.yaml` workflow now exists and is runnable by name.

Gaps against milestone intent:

- Current runner only supports agent steps; exec steps are still unsupported.
- The runner currently uses a minimal default provider selection path and does not yet honor project/provider frontmatter resolution.
- Prompt copying is template-pass-through only; variable expansion and runtime extension compilation are still missing.
- There is not yet an explicit `/next`, `/recompile`, or shell-shim-driven execution path.
- No `loop.sh` or `loop.ps1` shim was found.
- `aloop-agent` and the richer task/session-dir contract remain missing.

### M7 — Builtin tracker + minimal orchestrator slice

Status: interface-first, slice missing.

- `TrackerAdapter` contract exists.
- Session kinds already include `orchestrator` and `child`.

Gaps against milestone intent:

- No builtin tracker adapter implementation found.
- No daemon work-item projection implementation for tracker-normalized Epics/Stories/change sets was confirmed.
- No `aloop tracker` CLI was found.
- No minimal orchestrator workflow file was found.
- No serial child-dispatch runtime path was found.

### M8 — GitHub tracker adapter + policy enforcement + audit

Status: mostly absent.

- No GitHub tracker adapter implementation was confirmed.
- No policy enforcement path tied to tracker actions was confirmed.
- No `aloop gh` debugging CLI was found.

### M9 — Full orchestrator workflow + parallel dispatch + file scope

Status: prompt/workflow scaffolding exists, execution slice missing.

- Maintenance orchestrator workflow YAML exists.
- Spec-side orchestrator prompt inventory exists.

Gaps against milestone intent:

- No runner-backed orchestrator execution engine was found.
- No parallel child dispatch implementation was confirmed.
- No `file_scope.owned` enforcement path was found.
- No comment-triggered orchestrator conversation runtime was confirmed.
- No `orch_diagnose` action loop was found.

## Baseline findings

- The current repo is ahead of the delivery plan on route and substrate scaffolding for M1-M4.
- The first true missing vertical slice is M6: there is no verified runner that turns compiled plans into executed turns.
- Several M7-M9 surfaces are present as types, routes, prompt templates, or workflow YAML, but not yet as an executable orchestrator slice.
- The current test baseline also depended on a fresh workspace install. Running `bun install` restored missing workspace links for route packages and removed the daemon integration test import failures.

## Vertical slice order

### Slice 0 — Foundation baseline green

Goal: keep M1-M4 executable and trustworthy before adding runner work.

TODO:

- Keep workspace install graph healthy on a clean clone.
- Make `bun test` green in the current repo state.
- Preserve current daemon, scheduler, provider-route, project-route, and config-route integration coverage.
- Capture the clean-clone bootstrap command sequence.

Acceptance:

- Fresh install plus `bun test` passes.

### Slice 1 — Project compile and daemon control-plane smoke

Goal: prove the daemon can register a project, compile its pipeline input, and expose the resulting control-plane state.

TODO:

- Add an end-to-end test for workspace/project registration plus compile/reload behavior.
- Ensure a project-level compile step writes stable `loop-plan.json` output.
- Ensure config reload updates the next effective compiled plan.
- Keep the test focused on one trivial project fixture.

Acceptance:

- Create project -> compile `pipeline.yml` -> reload -> observe expected compiled plan artifact.

### Slice 2 — Single-session quick-fix runner

Goal: implement the first real end-to-end loop from compiled plan to persisted turn output.

TODO:

- Introduce the runner entrypoint that consumes `loop-plan.json`.
- Add queue-first selection and cycle/finalizer cursor movement.
- Acquire and release scheduler permits from the runner.
- Invoke the opencode adapter through the provider registry.
- Persist `agent.chunk` events into the session log.
- Update session state from `pending` to `running` to terminal status.
- Ship the missing `quick-fix.yaml` workflow.
- Add a fake-provider or stubbed provider test path so the slice is deterministic.

Acceptance:

- Launch one standalone quick-fix session on a trivial repo and observe completed or failed terminal status plus replayable turn chunks.

Status update:

- Implemented minimally.
- Covered by daemon integration tests using a stubbed opencode runner.
- Next work on this slice should extend it to exec steps, richer provider resolution, and explicit recompile/mutation flows rather than rebuilding from scratch.

### Slice 3 — Loop shims and agent CLI contract

Goal: close the gap between shell entrypoints, session-dir state, and the runner.

TODO:

- Implement `loop.sh` and `loop.ps1` as thin lock-and-invoke clients.
- Implement `aloop-agent submit`.
- Implement minimal `aloop-agent todo` commands required by the first quick-fix slice.
- Add `AUTH_HANDLE` validation for runner-provider calls.
- Add environment sanitization and request throttling around agent/provider execution.

Acceptance:

- The runner can execute through the public shim/CLI contract instead of test-only direct calls.

### Slice 4 — Offline orchestrator serial dispatch

Goal: get the first orchestrator use case working without GitHub or parallelism.

TODO:

- Implement builtin tracker adapter with file-backed work items and event log.
- Add daemon projection for normalized tracker work items.
- Ship a minimal `orchestrator.yaml` focused on decompose and dispatch.
- Allow orchestrator sessions to create child sessions serially.
- Close builtin tracker work items from child completion.

Acceptance:

- One orchestrator session decomposes a tiny test spec into three Stories and dispatches three child sessions serially to completion.

### Slice 5 — GitHub tracker and policy audit

Goal: replace the offline tracker with a production-facing tracker slice while keeping orchestration behavior stable.

TODO:

- Implement GitHub tracker read/write primitives for native sub-issues.
- Add webhook plus poll reconciliation.
- Enforce the hardcoded policy table from the security spec.
- Emit audit events for granted and denied policy decisions.
- Add minimal `aloop gh` debugging surface.

Acceptance:

- A tiny GitHub-backed decomposition flow creates sub-issues and records denied policy actions in the audit log.

### Slice 6 — Parallel orchestrator and file-scope enforcement

Goal: reach the first M9-grade orchestrator behavior with bounded concurrency and overlap protection.

TODO:

- Add parallel child dispatch through scheduler permits.
- Implement `file_scope.owned` overlap checks.
- Add human comment trigger -> orchestrator conversation handling.
- Add the first diagnoser actions needed to recover from stuck or conflicting work.
- Add `agent/trunk` branch-management skeleton for the orchestrator path.

Acceptance:

- One multi-epic orchestration run dispatches disjoint children in parallel and rejects overlapping scopes.

## Immediate next slice

Start with Slice 0, then move directly to Slice 2.

Reason:

- Slice 0 removes noise and gives a trustworthy TDD baseline.
- Slice 2 is the first missing vertical behavior that unlocks all later milestones.
- Slice 1 matters, but only as much as needed to feed the runner with a real compiled plan artifact.