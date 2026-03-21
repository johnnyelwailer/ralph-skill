# Issue #179: Request payload validation and idempotency guards

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Add `validateRequest()` function with per-type field validation in `requests.ts` — currently `JSON.parse` result is blindly cast to `AgentRequest` with no runtime checks; missing fields cause runtime crashes
- [x] Wire `validateRequest()` into `processAgentRequests()` — call after JSON parse, move invalid payloads to `requests/failed/` with descriptive error in log
- [x] Add idempotency: track processed request IDs in `requests/processed-ids.json` — load set at start of `processAgentRequests`, skip already-seen IDs with log entry, persist after processing
- [ ] Add `create_issues` dedup: before creating an issue, check if an issue with the same title already exists in orchestrator state → skip
- [ ] Add `create_pr` dedup: check if PR already exists for same head/base → skip
- [ ] Add `merge_pr` dedup: check if PR already merged via `gh pr view` status → skip
- [ ] Add `post_comment` dedup: embed `request.id` as HTML comment in comment body for dedup detection
- [ ] Add unit tests for `validateRequest()` — cover all 11 request types, valid and invalid payloads
- [ ] Add unit tests for idempotency guards — duplicate request ID skipping, create_issues/create_pr/merge_pr/post_comment dedup

### Completed
- [x] ETag cache persistence — `EtagCache` in `github-monitor.ts` persists to `github-etag-cache.json`, loaded at startup and saved after each scan pass (verified in `process-requests.ts:402-586` and `orchestrate.ts:5014-5495`)
