# Issue #126: PR lifecycle fails silently from GH API rate limits — needs throttling and retry

## Completed

All tasks for Issue #126 are complete. This file contains the final spec-gap analysis results.

### Spec-Gap Analysis

spec-gap analysis: no discrepancies found — spec fully fulfilled.

**Issue #126 scope verified:**
- [x] Throttle PR lifecycle — `iteration % 5 === 0` guard at `orchestrate.ts:5443` and `5555`
- [x] API error detection — `PrGateStatus` includes `'api_error'` at `orchestrate.ts:3327`; merge gate catch at `3440` and CI gate catch at `3496`
- [x] Rate limit awareness — `checkGitHubRateLimit()` at `orchestrate.ts:3375`, called before lifecycle at `5558`; logs `scan_pr_lifecycle_rate_limited`
- [x] Bulk GraphQL PR data — `BulkIssueState`/`fetchBulkIssueState` imported and used in `checkPrGates()` to skip per-PR REST calls
- [x] No permanent failure on transient errors — `api_error_count` tracked with `ORCHESTRATOR_API_ERROR_PERSISTENCE_LIMIT = 10`; `state: 'failed'` only set after 10 consecutive API errors (`orchestrate.ts:3752`)

**Previously noted P3 gap — now resolved:**
- [x] [spec-gap/P3] ~~`start.ts` missing `opencode` provider~~ — **RESOLVED**: `ProviderName`, `PROVIDER_SET`, `MODEL_PROVIDER_SET`, and `DEFAULT_MODELS` all include `opencode` in `start.ts` lines 11, 18, 19, 21-26. `aloop start --provider opencode` now accepted by CLI validation.

**Pre-existing implementation gaps in SPEC-ADDENDUM.md (out of scope for Issue #126):**
These are documented in SPEC-ADDENDUM.md "Known Implementation Gaps" section (lines 1122+) and were pre-existing before Issue #126 work began. Not blocking.
