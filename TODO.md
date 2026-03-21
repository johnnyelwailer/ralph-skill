# TODO

## Current Phase: Issue #118 — Cost monitoring: budget warnings, pause threshold & cost-by-model breakdown

### In Progress

(none)

### Up Next

- [ ] Add `useCost` hook with cumulative cost tracking and warning threshold state (`aloop/cli/dashboard/src/hooks/useCost.ts`) — aggregate `cost_usd` from all `iteration_complete` log entries, read `budget_cap_usd` / `budget_warnings` / `budget_pause_threshold` from meta.json via `/api/state`, track which thresholds have already fired (priority: high)
- [ ] Fire Sonner budget warning toasts at configurable thresholds (default: 70%, 85%, 95%) — each threshold fires only once per session; yellow for 70%/85%, red for 95%; toast includes percentage, current spend, budget cap (priority: high)
- [ ] Add `POST /api/cost/budget-exceeded` route in `dashboard.ts` — writes `budget_exceeded` event to `log.jsonl` when `budget_pause_threshold` is hit; called from `useCost` hook when threshold crossed (priority: high)
- [ ] Show "Budget exceeded — dispatch paused" banner in AppView when `budget_exceeded` event exists in log (priority: high)
- [ ] Add cost-by-model breakdown table in analytics tab — new "Analytics" tab in docs panel, table with model name, total tokens (input/output), total cost, percentage of total; data aggregated client-side from log entries or via `/api/cost/aggregate` (priority: medium)
- [ ] Make cost-by-model table sortable by cost column (priority: medium)
- [ ] Log `session_cost` event to `log.jsonl` on session end — compute delta of cumulative cost at session start vs end (priority: medium)
- [x] [review] Gate 3: `validateRequest` has zero unit tests — add dedicated tests for: null/non-object input, missing/empty `id`, missing/null `payload`, and every type-specific validation error path (e.g., create_issues with empty array, merge_pr with invalid strategy, dispatch_child missing sub_spec_file, requirePositiveInt with negative/non-integer values, optionalStringArray with non-string elements) (priority: high)
- [ ] [review] Gate 1: Idempotency guards missing for `dispatch_child` (check if child session already running for same issue), `post_comment` (content hash dedup), `close_issue` (no-op if already closed) in `requests.ts` (priority: high)

### Bugs

- [ ] [qa/P1] README documents wrong flags for `aloop start` resume: README says `--launch-mode resume --session-dir <path>` but CLI actually uses `--launch resume` with positional session-id. Users following README instructions will get "unknown option" errors. Tested at iter 16. (priority: high)

### Completed

- [x] [review] Gate 1: ETag cache persistence — fully implemented in `github-monitor.ts` (`EtagCache` class with `load()`, `save()`, corruption recovery). Used in `process-requests.ts:395-396` and `orchestrate.ts:5010,5507`. File stored at `github-etag-cache.json`. Tests in `github-monitor.test.ts` cover load, save, corruption, nested dirs.

### Deferred

(none)
