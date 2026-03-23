# Sub-Spec: Issue #145 — Complete all request type handlers in processAgentRequests

## Objective

Audit, fix, and fully test all request type handlers in `processAgentRequests()` (`requests.ts`). All 11 handlers exist but several have implementation defects. Additionally, `requests.ts` at ~950 LOC badly violates the 150-LOC constitution rule and must be split.

## Architectural Context

`requests.ts` sits in the **runtime handler library layer** (`aloop/cli/src/lib/`). It is the trust boundary through which agents express external intent — the aloop runtime decides what to execute.

**Call chain:**
```
loop.sh (between iterations)
  → aloop process-requests --session-dir <dir>
    → processRequestsCommand()  [commands/process-requests.ts]
      → (orchestrator result processing — decomposition, refine, estimate)
    → processAgentRequests()  [lib/requests.ts]
      → handleRequest() → individual handler functions
```

`processAgentRequests()` receives a `RequestProcessorOptions` with:
- `workdir` — project root (where body_file/prompt_file paths are resolved)
- `aloopDir` — the session's `.aloop` dir (`<sessionDir>/.aloop`)
- `sessionDir` — the session directory (`~/.aloop/sessions/<sessionId>/`)
- `ghCommandRunner` — injected GH adapter (testable)
- `spawnSync` — injected process spawner (testable)

The **home-level** aloop directory is `path.dirname(options.aloopDir)` (i.e., `~/.aloop/`). Active and historical sessions are at `~/.aloop/sessions/`, not `options.aloopDir/sessions/`.

## Known Defects to Fix

### 1. `handleDispatchChild` — calls `aloop` CLI recursively
`spawnSync('aloop', ['gh', 'start', ...])` invokes the aloop CLI from within the aloop CLI, risking recursive re-entry and coupling to CLI availability in the runtime environment. The handler must dispatch by writing the session launch via the proper runtime path — either use `ghCommandRunner` with a `dispatch-child` operation type, or call the internal session-start API directly.

### 2. `handleUpdateIssue` — mutually exclusive branches drop updates
When `body_file` is set, state and label changes are silently discarded. When `body_file` is absent, body changes are impossible. The handler must support all four fields (`body_file`, `state`, `labels_add`, `labels_remove`) in a single `gh issue edit` call.

### 3. `handleSteerChild` — wrong path for session lookup
`findSessionByIssue()` looks at `path.join(options.aloopDir, 'sessions', sessionId)` but active child sessions live at `path.join(path.dirname(options.aloopDir), 'sessions', sessionId)` (home-level `.aloop`). This path mismatch causes steer operations to always fail to find the child.

### 4. `handleStopChild` — same home-dir path issue
Same root cause as #3: `path.dirname(options.aloopDir)` must be used as `homeDir` for session lookup and stop operations, not `options.aloopDir`.

## Scope

Files **in-scope** for modification:
- `aloop/cli/src/lib/requests.ts` — primary file (must be split per rule #7)
- `aloop/cli/src/lib/requests.test.ts` — tests (must cover all handlers)

Split target (new files, all under `aloop/cli/src/lib/`):
- `requests-types.ts` — `RequestType`, all interfaces, `AgentRequest` union, `ValidationError` (~60 LOC)
- `requests-validate.ts` — `validateRequest()` (~120 LOC)
- `requests-handlers.ts` — all handler functions + helpers (~300–400 LOC, may need further split)
- `requests.ts` — re-exports `processAgentRequests`, `validateRequest`, and public types for backwards compat (~20 LOC)

If `requests-handlers.ts` exceeds 150 LOC after the split, further divide:
- `requests-handlers-gh.ts` — GH-facing handlers (create_issues, update_issue, close_issue, create_pr, merge_pr, post_comment, query_issues)
- `requests-handlers-session.ts` — session-facing handlers (dispatch_child, steer_child, stop_child, spec_backfill)

## Out of Scope

- `aloop/cli/src/commands/process-requests.ts` — orchestrator command; has its own result-file processing pipeline. Do not conflate with agent request handling. *(Rule #8: separation of concerns, Rule #12: one issue one concern)*
- `loop.sh` / `loop.ps1` — dumb runners with no business logic. *(Rule #1)*
- `aloop/cli/src/commands/gh.ts` — GH adapter; request handlers must call it via `ghCommandRunner`, not directly. *(Rule #8)*
- `aloop/cli/src/lib/orchestrate.ts` — orchestrator scan logic; dispatch goes through the session infrastructure, not orchestrate directly. *(Rule #8)*
- Any SPEC rewrites or cross-cutting refactors. *(Rule #12)*

## Constraints

- **Rule #2 (inner loop / runtime separation):** All host-side operations belong in the runtime. `handleDispatchChild` must NOT call the `aloop` CLI — it IS the runtime.
- **Rule #4 (agents are untrusted):** All external operations remain mediated by this runtime layer. GH calls go through `ghCommandRunner`.
- **Rule #5 (side effects via request files):** The request/response file protocol is already correctly used. Do not change the contract.
- **Rule #7 (small files, <150 LOC):** `requests.ts` at 950 LOC must be split. The split must preserve the existing public API surface so callers (`process-requests.ts`, tests) don't break.
- **Rule #8 (separation of concerns):** Types, validation, and handlers are three separate concerns — separate files.
- **Rule #11 (test everything):** Every handler must have at minimum one success path test and one failure/error path test. Use the existing `setupTestEnv()` + `ghRunner` mock pattern.
- **Rule #17 (validate at boundaries, trust internally):** `validateRequest()` is the boundary. Handlers may trust the validated request object — no redundant null checks on already-validated fields.

## Acceptance Criteria

- [ ] `requests.ts` is split into focused modules, each ≤150 LOC; public API unchanged
- [ ] `handleDispatchChild` does not call `spawnSync('aloop', ...)` — uses `ghCommandRunner` or internal session API
- [ ] `handleUpdateIssue` applies body, state, and label changes in a single `gh issue edit` call (all fields present in payload are applied)
- [ ] `handleSteerChild` uses `path.dirname(options.aloopDir)` (home-level) for session lookup, not `options.aloopDir`
- [ ] `handleStopChild` uses `path.dirname(options.aloopDir)` (home-level) for session and home-dir references
- [ ] All 11 handlers have at least one passing success-path test in `requests.test.ts`
- [ ] All 11 handlers have at least one passing failure-path test in `requests.test.ts`
- [ ] `npm test` (or equivalent) passes with no new test failures
- [ ] No file in the final state exceeds 150 LOC

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
