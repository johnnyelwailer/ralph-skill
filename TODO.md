# TODO

## Review Tasks (highest priority)

- [ ] [review] Gate 3: `validateRequest` is a new module (~130 lines, 40+ branches) with zero direct unit tests — add dedicated tests for: null/non-object input, missing/empty `id`, missing/null `payload`, and every type-specific validation error path (e.g., create_issues with empty array, merge_pr with invalid strategy, dispatch_child missing sub_spec_file, requirePositiveInt with negative/non-integer values, optionalStringArray with non-string elements) (priority: high)
- [ ] [review] Gate 1: Spec requires ALL request types be idempotent — `dispatch_child` (check if child session already running), `post_comment` (content hash dedup), `close_issue` (no-op if already closed) have no idempotency guards. See TASK_SPEC.md acceptance criteria. (priority: high)
- [ ] [review] Gate 1: ETag cache persistence not started — spec requires: persist EtagCache to `etag-cache.json`, load on startup, save after fetches, handle corruption gracefully (reset to empty on parse error). Zero code exists for this. (priority: high)

## Bugs

- [ ] [qa/P1] README documents wrong flags for `aloop start` resume: README says `--launch-mode resume --session-dir <path>` but CLI actually uses `--launch resume` with positional session-id. Users following README instructions will get "unknown option" errors. Tested at iter 16. (priority: high)
