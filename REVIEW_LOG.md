# Review Log

## Review — 2026-03-22 — commit 2149734..8f75f05

**Verdict: FAIL** (6 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts` (PR lifecycle gates, throttle), `aloop/cli/src/commands/orchestrate.test.ts` (PR lifecycle tests)

### Gate 1 (Spec Compliance): FAIL
- `orchestrate.ts:3249`: Merge gate catch returns `status: 'pass'` instead of `'api_error'`. TODO claims "Merge and CI catch blocks now use `status: 'api_error'`" but the merge gate was not updated. This causes merge API errors to bypass Step 2b (api_error early return) and trigger rebase requests on transient failures.

### Gate 2 (Test Depth): FAIL
- **Mock arg mismatch (7+ tests):** Tests at lines 2717-2858 and 2966-2993 use `args.includes('checks')` to match CI gate calls but the actual `checkPrGates` code passes `'statusCheckRollup'` in the args. The mock condition never fires. Tests that assert `status: 'pass'` for CI pass accidentally (empty response → JSON parse error → catch with no workflows → 'pass'). Tests that assert `status: 'pending'` or `status: 'fail'` would fail outright.
- **Mock response format mismatch (2 tests):** Tests at lines 3136 and 3161 correctly use `args.includes('statusCheckRollup')` but return a bare JSON array `[...]` instead of `{statusCheckRollup: [...]}`. The code does `parsed.statusCheckRollup ?? []`, so `checks` is always empty. These tests would fail (CI gate always passes instead of producing failures).
- **reviewPrDiff test stale (1 test):** Test at line 2903 asserts `verdict: 'flag-for-human'` but the code was changed to return `verdict: 'pending'` (with different summary text). Test was not updated.

### Gate 3 (Coverage): INCOMPLETE
- Cannot run coverage (bash unavailable). Based on code inspection: the new Step 2b api_error handling (lines 3525-3530) has one correct test (line 3193). The throttle logic (line 5327-5328) has two correct tests (lines 4568, 4587). The merge gate error path is untested due to the bug above. Multiple supposed-coverage tests are broken and provide zero real coverage.

### Gate 4 (Code Quality): FAIL
- `orchestrate.ts:3534`: `mergeCheckErrored` checks `detail?.startsWith('Failed to check')` but no code path produces that prefix. Dead code — the merge catch produces `'Merge check skipped (API error): ...'`. Once merge gate uses `'api_error'` status, Step 2b handles it and this string matching is fully unreachable.

### Gate 5 (Integration Sanity): FAIL
- At least 8 tests would fail if run:
  - `checkPrGates` tests: 2760, 2779, 2799, 2841
  - `processPrLifecycle` tests: 2993, 3136, 3161
  - `reviewPrDiff` test: 2903

### Gate 6 (Proof Verification): PASS (N/A)
- No proof artifacts directory found. Changes are purely internal plumbing (API error classification, throttling). Skipping proof is the expected correct outcome.

### Gate 7 (Runtime Layout): PASS (N/A)
- No UI changes.

### Gate 8 (Version Compliance): PASS (N/A)
- No dependency changes in this iteration.

### Gate 9 (Documentation Freshness): PASS (N/A)
- No user-facing behavior changes requiring doc updates.

---

## Review — 2026-03-22 — commit 8f75f05..a4db720

**Verdict: FAIL** (2 prior findings still open, 0 new findings)
**Scope:** `orchestrate.ts` (1-line merge gate fix), `orchestrate.test.ts` (mock arg + payload fixes), QA log/coverage files

### Prior findings resolved (4 of 6)
- Gate 1: Merge gate catch now returns `status: 'api_error'` (line 3249) — **FIXED** in commit 3f3bcd4
- Gate 2: All 18 mock `args.includes('checks')` changed to `args.includes('statusCheckRollup')` — **FIXED** in commit 78bcaa7
- Gate 2: All mock responses wrapped as `{ statusCheckRollup: [...] }` — **FIXED** in commit 13b6c82
- Gate 2: Test at line 2841 (`api_error for mergeability gate`) now passes — **FIXED** (unblocked by merge gate fix)

### Prior findings still open (2 of 6)
- Gate 4: `orchestrate.ts:3534` — `mergeCheckErrored` is dead code. Step 2b (lines 3526-3530) catches all `api_error` gates before reaching line 3534. When merge gate is `pass`/`fail`, the detail never starts with `'Failed to check'`. `mergeCheckErrored` is always `false`.
- Gate 2+5: `reviewPrDiff` test at line 2908 still asserts `verdict: 'flag-for-human'` but code returns `'pending'`. **Confirmed failing at runtime.**

### Gate 5 (Integration Sanity): FAIL
- 17 test failures total; 1 attributable to this task (`reviewPrDiff > flags for human when diff fetch fails`). Other 16 are pre-existing (dashboard, orchestrate --plan, validateDoR, launchChildLoop, etc.).

### Gates 1, 3, 6-9: PASS (or N/A)

---

## Review — 2026-03-22 — commit 150fdc7..2d11201

**Verdict: PASS** (all prior findings resolved, 0 new findings)
**Scope:** `orchestrate.ts` (dead code removal, API error persistence tracking), `orchestrate.test.ts` (reviewPrDiff fix, 5 new API error tests)

### Prior findings resolved (2 of 2)
- Gate 4: `mergeCheckErrored` dead code — **FIXED** in commit a9e8ea2. Grep confirms zero references remain in codebase.
- Gate 2+5: `reviewPrDiff` test — **FIXED** in commit 51c787b. Test at line 2903 now asserts `verdict: 'pending'` and `summary.includes('PR diff fetch failed (will retry): Not found')`, matching implementation at lines 3326-3330.

### New work reviewed (commit 156b029)
- API error persistence tracking: `api_error_count`/`api_error_summary` fields on `OrchestratorIssue`, `ORCHESTRATOR_API_ERROR_PERSISTENCE_LIMIT = 10`, `resetApiErrorTracking()` helper.
- Step 2b in `processPrLifecycle` (lines 3544-3605): catches `api_error` gates before Step 3 (rebase) and Step 4 (CI failure), preventing transient API errors from triggering rebase attempts or CI failure escalation.
- 5 new tests cover: CI API error isolation (line 3197), merge API error isolation (line 3231), persistence threshold escalation (line 3261), reset on success (line 3292), plus the fixed reviewPrDiff test (line 2903).

### Gate 1 (Spec Compliance): PASS
- Spec says "Same error persisting after N attempts → flag for human" — implementation uses N=10 for API errors with `flagForHuman` escalation. Transient errors return `gates_pending` for retry rather than failing.

### Gate 2 (Test Depth): PASS
- 5 tests assert specific values: exact `api_error_count`, exact `action`, exact `state`, exact log events. Edge cases covered: threshold boundary (9→10), reset path, isolation from CI/rebase counters.

### Gate 3 (Coverage): INCOMPLETE (bash unavailable)
- Code inspection: all 3 branches of Step 2b tested (under threshold, at threshold, no errors). Reset tested at both call sites.

### Gate 4 (Code Quality): PASS
- No dead code, no TODOs, no duplication. `mergeCheckErrored` fully removed.

### Gate 5 (Integration Sanity): INCOMPLETE (bash unavailable)
- Code-level analysis shows no regressions. Mock patterns match actual code. Pre-existing failures remain out of scope.

### Gates 6-9: PASS (N/A)
- No proof artifacts needed (internal changes), no UI changes, no dependency changes, no doc changes.

---
