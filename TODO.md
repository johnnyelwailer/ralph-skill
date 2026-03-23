# Issue #126: PR lifecycle fails silently from GH API rate limits — needs throttling and retry

## Completed

All tasks for Issue #126 are complete. This file contains the final spec-gap analysis results. [reviewed: gates 1-9 pass]

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

### Spec-Review Approval

**APPROVED** — spec-review agent confirms all Issue #126 requirements are satisfied.

Requirements cross-referenced against SPEC.md §Efficient GitHub Monitoring (lines 1502–1545), §Monitor + Gate + Merge (lines 1873–1921), and SPEC-ADDENDUM.md §Persistent CI Failure (lines 1271–1279):

| Requirement | Spec citation | Implementation | Verdict |
|---|---|---|---|
| PR lifecycle throttled (not every pass) | §Efficient GitHub Monitoring: rate-limit-budget-aware design | `iteration % 5 === 0` at `orchestrate.ts:5443,5555` | PASS |
| Rate limit pre-check before lifecycle | §Efficient GitHub Monitoring: well under 1% of rate limit | `checkGitHubRateLimit()` at `orchestrate.ts:3375`, skips if remaining < 200, logs `scan_pr_lifecycle_rate_limited` | PASS |
| API errors classified as transient | §Monitor + Gate + Merge: flag for human after N attempts, not silent failure | `PrGateStatus = 'api_error'` at `orchestrate.ts:3327`; `api_error_count` incremented with retry | PASS |
| Transient API errors do not permanently fail issue | §Monitor + Gate + Merge: persistent failures → flag for human | `ORCHESTRATOR_API_ERROR_PERSISTENCE_LIMIT = 10`; flags for human + sets `state: 'failed'` only after 10 consecutive errors (`orchestrate.ts:3744`) | PASS |
| Bulk GraphQL for PR data | §Efficient GitHub Monitoring: single GraphQL query fetching PRs | `fetchBulkIssueState` with ETag caching; `bulkPrData` passed to `checkPrGates()` | PASS |
| Persistent CI failure closes PR + resets to pending | SPEC-ADDENDUM.md §Persistent CI Failure: close PR, reset to `pending`, fresh dispatch | Close PR + reset at `orchestrate.ts:3838–3868` after `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3) retries | PASS |
| No issue stuck in `failed` permanently | SPEC-ADDENDUM.md §Acceptance Criteria line 1296 | API errors → flag for human (not silent fail); CI failures → reset to `pending` | PASS |

No gaps found. Issue #126 is fully compliant with specification.
