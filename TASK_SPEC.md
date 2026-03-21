# Sub-Spec: Issue #179 — Request payload validation and idempotency guards

Part of #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Objective

Add schema validation for all request payloads and idempotency guards to prevent duplicate side effects.

## Context

`aloop/cli/src/lib/requests.ts` processes agent-produced request files. Currently:
- JSON parse errors move files to `requests/failed/` ✓
- But there's no schema validation — a request with `type: 'create_issues'` but missing `payload.issues` will throw at runtime
- No idempotency: re-processing a `create_issues` request creates duplicate issues
- No dedup: if an agent writes the same request twice, both are processed

## Deliverables

### Payload validation (`aloop/cli/src/lib/requests.ts`)
- Add `validateRequest(request: unknown): AgentRequest` function
- Validate required fields per request type:
  - `create_issues`: `payload.issues` array, each with `title` and `body_file`
  - `update_issue`: `payload.number` (positive integer)
  - `close_issue`: `payload.number`, `payload.reason`
  - `create_pr`: `payload.head`, `payload.base`, `payload.title`, `payload.body_file`, `payload.issue_number`
  - `merge_pr`: `payload.number`, `payload.strategy` in ['squash', 'merge', 'rebase']
  - `dispatch_child`: `payload.issue_number`, `payload.branch`, `payload.pipeline`, `payload.sub_spec_file`
  - `steer_child`: `payload.issue_number`, `payload.prompt_file`
  - `stop_child`: `payload.issue_number`, `payload.reason`
  - `post_comment`: `payload.issue_number`, `payload.body_file`
  - `query_issues`: (all fields optional)
  - `spec_backfill`: `payload.file`, `payload.section`, `payload.content_file`
- Invalid payloads → `requests/failed/` with error description in log

### Idempotency guards
- Track processed request IDs in `requests/processed-ids.json` (set of request.id strings)
- Before processing any request, check if `request.id` already processed → skip with log entry
- For `create_issues`: check if issue with same title already exists in orchestrator state → skip
- For `merge_pr`: check if PR already merged via `gh pr view` status → skip
- For `create_pr`: check if PR already exists for that head/base → skip
- For `post_comment`: include request.id in comment body as HTML comment for dedup detection

### ETag cache persistence
- Verify `EtagCache` in `github-monitor.ts` persists to `github-etag-cache.json` ✓ (already implemented)
- Ensure cache loaded at startup and saved after each scan pass

## Acceptance Criteria

- [ ] All request types validated before processing
- [ ] Malformed requests moved to `requests/failed/` with error details
- [ ] Request IDs tracked for idempotency
- [ ] Duplicate `create_issues` / `create_pr` / `merge_pr` / `post_comment` are skipped
- [ ] ETag cache persisted across restarts
- [ ] Unit tests for validation and idempotency

## File Scope
- `aloop/cli/src/lib/requests.ts` (modify)
- `aloop/cli/src/lib/requests.test.ts` (add tests)
