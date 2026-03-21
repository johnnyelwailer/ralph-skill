# Issue #119: QA coverage percentage display from QA_COVERAGE.md

## Current Phase: Implementation

### Gap Analysis Summary

The endpoint (`GET /api/qa-coverage`) and widget (`QACoverageBadge`) already exist but have significant gaps vs the spec:

1. **Server parser**: Uses regex `Coverage: XX%` instead of parsing the pipe-delimited table. Doesn't return `total_features`, `tested_features`, `passed`, `failed`, `untested`, or `features[]`.
2. **Response shape**: Returns `{ percentage, raw, available }` instead of spec's `{ coverage_percent, total_features, tested_features, passed, failed, untested, features: [...] }`.
3. **Widget color thresholds**: Uses yellow >= 60% instead of spec's yellow >= 50%.
4. **Expandable feature list**: Renders raw markdown instead of per-feature PASS/FAIL/untested status list.
5. **Refresh trigger**: Uses `state?.updatedAt` (any state change) instead of specifically `iteration_complete` events where phase is `qa`.
6. **Tests**: Test fixture uses `Coverage: 85%` format, not the pipe-delimited table.

### In Progress

- [x] Rewrite server-side parser to parse pipe-delimited markdown table (Feature|Component|Last Tested|Commit|Status|Criteria Met|Notes columns) — returns structured JSON with `coverage_percent`, `total_features`, `tested_features`, `passed`, `failed`, `untested`, and `features[]` array
- [x] Update API response shape from `{ percentage, raw, available }` to match spec: `{ coverage_percent, total_features, tested_features, passed, failed, untested, features: [...] }` — keep `available` and `error` fields for missing-file case
- [x] Fix color threshold in `QACoverageBadge`: change yellow from `>= 60%` to `>= 50%` to match spec (green >= 80%, yellow 50-79%, red < 50%)
- [x] Replace raw-markdown rendering in expanded view with structured per-feature list showing PASS/FAIL/UNTESTED status for each feature row
- [ ] Update refresh trigger: only bump `qaCoverageRefreshKey` on `iteration_complete` SSE events where phase is `qa`, not on every state change
- [x] Update server-side tests: use pipe-delimited table fixtures instead of `Coverage: XX%` text; test all response fields
- [ ] Update `QACoverageData` TypeScript interface in `AppView.tsx` to match new response shape

### QA Bugs

- [ ] [qa/P1] QA badge hidden when QA_COVERAGE.md missing: Removed QA_COVERAGE.md from worktree → QA badge completely disappears from dashboard top bar → Spec says should show "0% or No QA data". Tested at iter 1. (priority: high)

### Review Findings

- [ ] [review] Gate 1: `AppView.tsx:972` — `if (!coverage?.available) return null` hides badge entirely when QA_COVERAGE.md missing. Spec requires showing "0%" or "No QA data". Change to render a grey/muted badge with "QA: N/A" or "QA: 0%" instead of returning null. (priority: high)
- [ ] [review] Gate 1: `AppView.tsx:2189` — `qaCoverageRefreshKey={state?.updatedAt ?? ''}` refreshes QA badge on every state change. Spec requires refresh only on `iteration_complete` SSE events where phase is `qa`. Wire up SSE event filtering to only bump the refresh key on QA-phase iteration completions. (priority: high)
- [ ] [review] Gate 5: `orchestrate.ts:3526` — TypeScript compilation error: `PrGateStatus` and `"api_error"` have no overlap. The `api_error` status was added (commit 2149734) but not added to the `PrGateStatus` type union. Fix the type definition. (priority: high)
- [ ] [review] Gate 5: 23 test failures in `orchestrate.test.ts` and related suites. Verify which are regressions introduced by this branch vs pre-existing on master, and fix any regressions. (priority: medium)
- [ ] [review] Gate 6: Proof artifacts (`iter-16/output.txt`) contain only text output, not screenshots. For a UI widget change (QACoverageBadge), proof should include a screenshot of the badge in green/yellow/red states. If screenshot capture is not feasible, proof agent should skip rather than produce text filler. (priority: medium)

### Up Next

- [ ] Add graceful fallback: if `QA_COVERAGE.md` exists but has no parseable table, return `{ coverage_percent: 0, error: "parse_error", ... }` with empty features array
- [ ] Investigate baseline backpressure failures in unrelated suites (`src/commands/dashboard.test.ts` packaged-assets case and `src/commands/orchestrate.test.ts` assertions) that currently block full `aloop/cli` validation

### Completed

- [x] Rewrite server-side parser to parse pipe-delimited markdown table
- [x] Update API response shape to match spec
- [x] Update server-side tests with pipe-delimited table fixtures
