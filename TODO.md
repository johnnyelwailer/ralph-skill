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

### Up Next

- [ ] Add graceful fallback: if `QA_COVERAGE.md` exists but has no parseable table, return `{ coverage_percent: 0, error: "parse_error", ... }` with empty features array
- [ ] Investigate baseline backpressure failures in unrelated suites (`src/commands/dashboard.test.ts` packaged-assets case and `src/commands/orchestrate.test.ts` assertions) that currently block full `aloop/cli` validation

### Completed

- [x] Rewrite server-side parser to parse pipe-delimited markdown table
- [x] Update API response shape to match spec
- [x] Update server-side tests with pipe-delimited table fixtures
