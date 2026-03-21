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
- [ ] [review] Gate 1 FAIL — `processAgentRequests` is dead code: `process-requests.ts` never imports or calls `processAgentRequests` from `requests.ts`. The entire validation/idempotency/dedup pipeline (`validateRequest`, `loadProcessedRequestIds`, `saveProcessedRequestIds`, title dedup, head/base dedup, merge_pr idempotency, post_comment marker) is unreachable from the CLI. Wire `processAgentRequests` into `processRequestsCommand` or refactor `process-requests.ts` to use it. (priority: critical)
- [ ] [review] Gate 1 FAIL — `post_comment` dedup is write-only: The spec requires dedup *detection* — checking existing comments for `<!-- aloop-request-id: {id} -->` before posting. Current code only *embeds* the marker (`requests.ts:737-740`) but never reads comments to detect duplicates. Add a `gh api` call to list existing comments, search for the marker, and skip if found. (priority: high)
- [ ] [review] Gate 2 FAIL — `post_comment` test at `requests.test.ts:325-352` only verifies the marker is *embedded* in the outgoing body. It does not test dedup *detection* (skipping when marker already exists in prior comments). Add a test that seeds existing comments containing the request ID marker and asserts the handler skips posting. (priority: high)
- [ ] [review] Gate 3 FAIL — `handlePostComment` (`requests.ts:735-751`) has 0% branch coverage for dedup detection because the detection path doesn't exist yet. Once implemented, add tests for: (a) no prior comments, (b) prior comment with different request ID, (c) prior comment with same request ID → skip. (priority: high)
- [x] Add unit tests for `validateRequest()` function — test each request type's required fields, edge cases (missing fields, wrong types, empty strings, negative numbers) (priority: medium)
  - TASK_SPEC acceptance criteria: "Unit tests for validation and idempotency"
  - Currently `validateRequest` is only tested indirectly via `processAgentRequests` integration tests
- [ ] Add tests for `post_comment` HTML comment dedup embedding (priority: medium)
- [ ] [qa/P1] `process-requests` does NOT call `processAgentRequests`: Request files in `requests/` are completely ignored by the `process-requests` CLI command. Invalid payloads are never validated, `processed-ids.json` is never created, `requests/failed/` is never used. All issue #179 features (validation, idempotency, dedup guards) exist in code but are unreachable via the CLI. Evidence: 68 unprocessed request files accumulating in real orchestrator session, zero `processed-ids.json` across all sessions. Tested at iter 33. (priority: high)
- [ ] [qa/P1] `process-requests` silently succeeds with nonexistent `--session-dir`: Running `aloop process-requests --session-dir /tmp/totally-nonexistent-path` exits 0 with no output or error. Should exit non-zero with an error message. Tested at iter 33. (priority: high)
