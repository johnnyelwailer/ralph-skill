# Project TODO

## Current Phase: Issue #179 — Request payload validation and idempotency guards

### Completed
- [x] Add `validateRequest()` with per-type field validation for all 11 request types (`requests.ts:154-265`)
- [x] Wire `validateRequest()` into `processAgentRequests` — invalid payloads moved to `requests/failed/` with error log (`requests.ts:306`)
- [x] Track processed request IDs in `requests/processed-ids.json` — skip duplicates with log entry (`requests.ts:281-336, 359-374`)
- [x] `create_issues` title dedup: check orchestrator state for existing issue titles before creating (`requests.ts:434-501`)
- [x] `create_pr` head/base dedup: check if PR already exists for that head/base via `gh pr list` (`requests.ts:546-607`)
- [x] ETag cache persistence: `EtagCache` in `github-monitor.ts` persists to `github-etag-cache.json` with `load()`/`save()` methods
- [x] Integration tests for all request type handlers (create_issues, close_issue, post_comment, spec_backfill, steer_child, update_issue, create_pr, merge_pr, dispatch_child, stop_child, query_issues)
- [x] Tests for request ID idempotency persistence and duplicate skipping
- [x] Tests for create_issues title dedup against orchestrator state
- [x] Tests for create_pr head/base dedup
- [x] Add `merge_pr` idempotency: before merging, check if PR already merged via `gh pr view --json state` — skip if state is "MERGED" (`requests.ts:609-643`)
- [x] Tests for `merge_pr` already-merged idempotency guard
- [x] Add `post_comment` dedup: include `request.id` in comment body as HTML comment (`<!-- aloop-request-id: {id} -->`) for dedup detection (`requests.ts`)

### In Progress

### Up Next
- [x] Add unit tests for `validateRequest()` function — test each request type's required fields, edge cases (missing fields, wrong types, empty strings, negative numbers) (priority: medium)
  - TASK_SPEC acceptance criteria: "Unit tests for validation and idempotency"
  - Currently `validateRequest` is only tested indirectly via `processAgentRequests` integration tests
- [ ] Add tests for `post_comment` HTML comment dedup embedding (priority: medium)
