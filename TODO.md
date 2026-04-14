# Issue #11: Security Model: Trust Boundaries, aloop gh Policy & Request Protocol Hardening

## Tasks

### In Progress

### Up Next

- [x] Fix loop.ps1 Constitution violation: move `Check-FinalizerQaCoverageGate` and `Append-PlanTaskIfMissing` out of loop.ps1 into the runtime. loop.ps1 grew +115 lines vs master with QA coverage gate business logic added (commit e0c5ef5f, issue #104). Constitution rule 1 is a HARD RULE: "Nothing may be added to loop.sh or loop.ps1. Any PR that touches these files must reduce their line count." Create a CLI command (e.g., `aloop finalizer-qa-gate`) that implements the logic, call it from loop.ps1 with a single line, and remove the two functions from the script.

- [ ] Add test for `req-<NNN>-<type>.json` ordering: spec acceptance criterion 9 ("Request files named `req-<NNN>-<type>.json`, processed in order") requires a test that writes multiple files using the zero-padded `req-001-create_issues.json` / `req-002-merge_pr.json` naming convention and verifies they are processed in ascending order. Current tests use non-conforming names (`req-1.json`, `req-create-dedup.json`) which don't exercise the sorting behavior described in the spec.

- [ ] Split requests.ts: currently 1196 lines (was 581 on master, grew +615 lines for this issue). Constitution rule 7 targets < 150 LOC per file. Split into at minimum: `requests-types.ts` (type unions + BaseRequest interfaces), `requests-validate.ts` (validateRequest + validatePayload helpers), `requests-handlers.ts` (handleCreateIssues, handleCreatePr, handleMergePr, handleDispatchChild, handleSteerChild, handleStopChild, handlePostComment, handleQueryIssues, handleSpecBackfill, and their helper functions), and `requests-processor.ts` (processAgentRequests + loadProcessedRequestIds + writeSessionLogEntry).

### Deferred

- [ ] Add bats/shell test for `wait_for_requests` configurable timeout (REQUEST_TIMEOUT env var in loop.sh). Spec acceptance criterion 14 says "configurable timeout" — the code uses `${REQUEST_TIMEOUT:-300}` but no test exercises the timeout path. Low priority: the code is correct, only test coverage is missing.

### Completed

- [x] PATH sanitization in loop.sh: `setup_gh_block` creates shim dir, `ALOOP_ORIGINAL_PATH` exported before provider invocation, `cleanup_gh_block` restores PATH after. PATH hardening tests in `loop_path_hardening.tests.sh`.

- [x] PATH sanitization in loop.ps1: `Setup-GhBlock`/`Cleanup-GhBlock`, `$env:ALOOP_ORIGINAL_PATH` set, restored after provider call.

- [x] `aloop gh` subcommands with hardcoded policy: `pr-create`, `pr-comment`, `issue-comment` (child-loop); `issue-create`, `issue-close`, `issue-label`, `pr-merge`, `issue-comments`, `pr-comments` (orchestrator). All gated via `evaluatePolicy()` in `gh.ts`.

- [x] Per-role policy enforcement: child-loops blocked from `pr-merge`, `issue-create`, `issue-close`, `branch-delete`, raw API. Orchestrators blocked from `main`-targeting, `branch-delete`, raw API. All via `evaluatePolicy()`.

- [x] `gh_operation` and `gh_operation_denied` logging: every `executeGhOperation` call writes a JSONL entry to `log.jsonl` with timestamp, event type, role, operation, and enforced params. Denied ops log `gh_operation_denied` with reason.

- [x] PR operations force `--base agent/trunk`: `evaluatePolicy` returns `enforced: { base: 'agent/trunk', ... }` for both child-loop and orchestrator `pr-create` and `pr-merge`.

- [x] Issue operations require `aloop`/`aloop/auto` label: `includesAloopTrackingLabel()` check applied to `issue-create`, `issue-close`, `issue-label`, `issue-comment`, `pr-comment` for orchestrator role.

- [x] All GH operations force `--repo` from session config: `sessionPolicy.repo` loaded from `config.json` in `executeGhOperation`, cross-repo requests rejected.

- [x] Request files archived after processing: `processAgentRequests` moves processed files to `requests/processed/`, failed/malformed files to `requests/failed/`.

- [x] Malformed request handling: invalid JSON and schema validation failures are caught, file moved to `requests/failed/`, logged as `gh_request_failed`.

- [x] `body_file` in request protocol: all request types that carry markdown content (`create_issues`, `create_pr`, `post_comment`, `steer_child`, `update_issue`) use `body_file` path references, never inline content.

- [x] Idempotency: `create_issues` checks existing by title (local state + remote API); `create_pr` checks existing PR by head branch; `merge_pr` checks if already merged; `dispatch_child` checks `active.json` for existing session; `post_comment` injects `aloop-request-id` marker and checks before re-posting.

- [x] Duplicate request ID detection: `processAgentRequests` tracks processed IDs in `requests/processed-ids.json`, skips and archives duplicates.

- [x] Wait for requests in loop.sh: `wait_for_requests()` polls `requests/*.json` until empty, timeout via `${REQUEST_TIMEOUT:-300}`.

- [x] Wait for requests in loop.ps1: equivalent polling loop with configurable timeout.
