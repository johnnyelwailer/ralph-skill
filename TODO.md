# Issue #146: Request payload validation, idempotency, and ETag cache persistence

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Add payload validation layer to `requests.ts` — define `validateRequest(request)` that checks required fields, types, and value constraints per request type; malformed requests → `requests/failed/` with validation error details (priority: high)
- [x] Add idempotency checks to `handleCreateIssues` — before creating, query existing issues by title to skip duplicates (priority: high)
- [ ] Add idempotency checks to `handleCreatePr` — check if PR for same `head` branch already exists before creating (priority: high)
- [ ] Add idempotency checks to `handleMergePr` — check if PR is already merged, no-op if so (priority: high)
- [ ] Add idempotency checks to `handleCloseIssue` — check if issue is already closed, no-op if so (priority: high)
- [ ] Add idempotency checks to `handleDispatchChild` — check if child session already running for the issue (priority: medium)
- [ ] Add idempotency to `handlePostComment` — use content hash or request ID to detect duplicate comments (priority: medium)
- [ ] Add processed request ID tracking — maintain a `processed-requests.json` set in session dir; skip requests whose IDs have already been processed (priority: medium)
- [ ] Add tests for payload validation — cover missing fields, wrong types, unknown request types, and valid requests (priority: high)
- [ ] Add tests for idempotency — cover duplicate create_issues, duplicate create_pr, already-merged merge_pr, already-closed close_issue (priority: high)
- [ ] Investigate and fix pre-existing unrelated full-suite test failures in `dashboard.test.ts` and `orchestrate.test.ts` seen during `npm --prefix aloop/cli test` (priority: medium)

### Completed
- [x] ETag cache persistence — `EtagCache` in `github-monitor.ts` persists to `github-etag-cache.json`, loaded on startup, saved after fetch, corruption handled gracefully. Tests exist in `github-monitor.test.ts`.
