# Issue #119: QA coverage percentage display from QA_COVERAGE.md

## Current Phase: Hardening

### Gap Analysis Summary

All core spec requirements are implemented and verified:
- Server parser (`parseQaCoverageTable`) parses pipe-delimited markdown table → structured JSON with `coverage_percent`, `total_features`, `tested_features`, `passed`, `failed`, `untested`, `features[]`
- API endpoint (`GET /api/qa-coverage`) returns spec-compliant response shape
- Widget (`QACoverageBadge`) renders color-coded badge (green ≥80%, yellow ≥50%, red <50%), grey "N/A" when file missing
- Expandable feature list shows per-feature PASS/FAIL/UNTESTED status
- Refresh triggers only on `iteration_complete` SSE events where phase is `qa`
- All 3 review fix tasks passed gates 1-9; QA coverage tests: 8 PASS, 0 FAIL

Remaining work is hardening — type alignment and test triage.

### In Progress

### Up Next

- [x] Investigate baseline backpressure failures in unrelated suites (`src/commands/dashboard.test.ts` packaged-assets case and `src/commands/orchestrate.test.ts` assertions) that currently block full `aloop/cli` validation. (priority: low)

### Spec-Gap Analysis (2026-03-22)

spec-gap analysis: no P1 discrepancies found — issue #119 work is spec-compliant. Three P2/P3 spec-text issues noted below (none block completion).

- [ ] [spec-gap/P2] SPEC.md pipeline order self-contradiction: body text (lines 404-407, 420, 447) and `pipeline.yml` say proof is NOT in the continuous cycle (finalizer only), but acceptance criteria (lines 717, 775) and later sections (1299, 1321, 1868, 2124, 3426, 4081) claim proof IS in the cycle as "plan → build × 5 → proof → qa → review (9-step)". Files: `SPEC.md`, `.aloop/pipeline.yml`. Suggested fix: update spec — the acceptance criteria and orchestrator sections should match the body text and pipeline.yml (proof in finalizer only, cycle is 8-step).
- [ ] [spec-gap/P3] config.yml missing `on_start` section: SPEC (lines 1047-1052) specifies `on_start: { monitor: dashboard, auto_open: true }` config option, but `aloop/config.yml` doesn't have it. Files: `SPEC.md:1047-1052`, `aloop/config.yml`. Suggested fix: add `on_start` to config.yml or mark as "not yet implemented" in spec.
- [ ] [spec-gap/P3] QA coverage dashboard widget not documented in SPEC: `QACoverageBadge`, `parseQaCoverageTable`, and `GET /api/qa-coverage` are implemented (issue #119) but SPEC.md's dashboard section has no acceptance criteria for QA coverage display. Files: `SPEC.md` (dashboard section ~line 1100), `aloop/cli/src/commands/dashboard.ts`. Suggested fix: add acceptance criteria to SPEC.md dashboard section describing the QA coverage badge, API endpoint, and refresh behavior.

### Deferred

- [~] Update `QACoverageViewData` TypeScript interface in `AppView.tsx` — internal view type uses `percentage` while API returns `coverage_percent`, and summary fields (`total_features`, `tested_features`, `passed`, `failed`, `untested`) aren't mapped to the view layer. Not a bug: `parseQACoveragePayload` already bridges `coverage_percent` → `percentage`, and the component doesn't display summary counts. Deferred — only needed if widget adds summary stats display.
- [~] Add graceful fallback with `parse_error` flag — current behavior when file exists but has no parseable table: returns `{ coverage_percent: 0, features: [], available: true }`, widget shows "QA 0%". Acceptable behavior; spec doesn't require a `parse_error` field. Deferred unless UX issue reported.
- [~] [review] Gate 6: Proof artifacts (`iter-16/output.txt`) contain only text output, not screenshots. Not a code issue — proof agent limitation. Deferred until screenshot capture is implemented in the proof agent.

### Completed

- [x] Rewrite server-side parser to parse pipe-delimited markdown table (Feature|Component|Last Tested|Commit|Status|Criteria Met|Notes columns) — returns structured JSON with `coverage_percent`, `total_features`, `tested_features`, `passed`, `failed`, `untested`, and `features[]` array
- [x] Update API response shape from `{ percentage, raw, available }` to match spec: `{ coverage_percent, total_features, tested_features, passed, failed, untested, features: [...] }` — keep `available` and `error` fields for missing-file case
- [x] Fix color threshold in `QACoverageBadge`: change yellow from `>= 60%` to `>= 50%` to match spec (green >= 80%, yellow 50-79%, red < 50%)
- [x] Replace raw-markdown rendering in expanded view with structured per-feature list showing PASS/FAIL/UNTESTED status for each feature row
- [x] Update server-side tests: use pipe-delimited table fixtures instead of `Coverage: XX%` text; test all response fields
- [x] [review+qa/P1] Fix badge hidden when QA_COVERAGE.md missing: changed early return from `!coverage?.available` to `coverage === null` (loading-only). When `available` is false, badge now renders with grey/muted "QA: N/A" style instead of being hidden. [reviewed: gates 1-9 pass]
- [x] [review] Fix refresh trigger: only bump `qaCoverageRefreshKey` on `iteration_complete` SSE events where phase is `qa`, not on every state change. [reviewed: gates 1-9 pass]
- [x] [review] Fix TypeScript compilation error: `PrGateStatus` type union missing `"api_error"`. Added to type definition at `orchestrate.ts:3167`. [reviewed: gates 1-9 pass]
- [x] [review] Triage and fix test failures in `orchestrate.test.ts` — root cause: `checkPrGates` switched from `gh pr checks` to `gh pr view --json statusCheckRollup` but test mocks still matched `args.includes('checks')` and returned bare arrays instead of `{ statusCheckRollup: [...] }`. Also fixed: catch blocks now emit `'api_error'` status (was `'pass'`/`'fail'`), and "no checks ran" test updated to expect `'pass'` (deliberate policy change).
- [x] [hardening] Fix baseline test assertion drift in `src/commands/orchestrate.test.ts` and make `ghExecutor` PATH-hardening no-fallback test hermetic (`src/commands/gh.test.ts`): aligned expectations with current orchestrator behavior (spec-file reference prompts, `TASK_SPEC.md` seeding, triage cadence, stopped-child redispatch semantics, pending-on-diff-fetch-failure) and removed environment-dependent fallback leakage via `ALOOP_ORIGINAL_PATH`.
