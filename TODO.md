# Issue #126: PR lifecycle fails silently from GH API rate limits — needs throttling and retry

## Tasks

- [x] Implement as described in the issue
- [x] Fix stale test expectations for Issue #126 api_error behavior (checkPrGates, reviewPrDiff, processPrLifecycle)
- [x] Wire gh-retry.ts for per-call retry with exponential backoff

## Completed

### Implementation Summary

- **Throttle PR lifecycle**: Processing only every 5th scan pass (`iteration % 5 === 0`)
- **Rate limit pre-check**: `checkGitHubRateLimit()` skips lifecycle if remaining < 200
- **API error classification**: `PrGateStatus` includes `'api_error'` for transient failures
- **Retry with persistence**: `api_error_count` tracked up to `ORCHESTRATOR_API_ERROR_PERSISTENCE_LIMIT` (10) before flagging for human
- **Bulk GraphQL**: Reduces per-PR API calls with ETag caching
- **CI failure handling**: Close PR after `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3) persistent failures, reset for fresh dispatch

### gh-retry.ts Integration

- **Per-call retry**: `withGhRetry()` wraps PR lifecycle `execGh` with exponential backoff + jitter
- **Rate limit detection**: Pattern matching for 429, secondary rate limits, abuse detection, retry-after
- **Gradual rate limit backoff**: When remaining < 500, pauses between PR lifecycle iterations with proportional delay
- **ghExecutorWithRetry**: New exported wrapper for global retry on all gh CLI calls

### Test Fixes

- `checkPrGates` tests 6 & 7: Updated expectations from `'fail'` to `'api_error'`
- `reviewPrDiff` test: Updated from `'approve'` to `'flag-for-human'` (no auto-approve without reviewer)
- `processPrLifecycle` tests: Added `invokeAgentReview` mocks where merge flow expected approval
