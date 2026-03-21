# TODO

## Review Findings

- [x] [review] Gate 1: `handleMergePr` (requests.ts:642-644) writes temp request file with only `type` and `pr_number` — `payload.strategy` is omitted. Downstream gh.ts:1921 hardcodes `--squash`. Fix: include `strategy: request.payload.strategy` in temp file JSON and update gh.ts `pr-merge` case to read the strategy field instead of hardcoding `--squash`. Add a test that asserts strategy is passed through. (priority: high)
- [x] [review] Gate 4: `useIsTouchLikePointer` hook (dashboard/src/hooks/useIsTouchLikePointer.ts) and its test file are dead code — added but never imported anywhere in the dashboard. Remove both files. (priority: medium)

## Completed
- [x] Add `validateRequest(request: unknown): AgentRequest` function
- [x] Track processed request IDs in `requests/processed-ids.json`
- [x] Embed request.id in post_comment payloads as HTML comment
- [x] Add create_pr head/base dedup guard
- [x] Add unit tests for validation and idempotency
