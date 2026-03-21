# Review Log

## Review — 2026-03-22 — commit aff0140..9a6a427

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/dashboard/src/AppView.tsx`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/dashboard/src/App.coverage.test.ts`, `aloop/cli/src/commands/orchestrate.ts`

### Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| 1. Spec Compliance | **FAIL** | Badge hidden when file missing (spec says show 0%/N/A); refresh on all state changes instead of QA-phase only |
| 2. Test Depth | PASS | Tests assert exact values (coverage_percent=67, feature names, statuses); edge cases covered (missing file, no table) |
| 3. Coverage | PASS | Server parser `parseQaCoverageTable` has 3 integration tests covering happy path, missing file, empty table |
| 4. Code Quality | PASS | No dead code in QA-related changes; cost API routes are out of scope but not harmful |
| 5. Integration Sanity | **FAIL** | `tsc --noEmit` fails: `orchestrate.ts:3526` — `api_error` not in `PrGateStatus` type. 23 test failures (need triage vs master) |
| 6. Proof Verification | **FAIL** | `iter-16/output.txt` is text, not a screenshot. UI widget change needs visual proof |
| 7. Runtime Layout | SKIP | Badge is a small inline widget, not a layout change |
| 8. Version Compliance | PASS | No new dependencies for QA coverage feature |
| 9. Documentation | PASS | Internal dashboard widget, no user-facing docs required |

### Findings Detail

1. **Gate 1 — Badge hidden when file missing:** `AppView.tsx:972` returns `null` when `!coverage?.available`, making the badge disappear. Spec acceptance criteria: "Missing QA_COVERAGE.md handled gracefully (shows 0% or 'No QA data')". This is also the QA/P1 bug already filed.

2. **Gate 1 — Refresh trigger not spec-compliant:** `AppView.tsx:2189` passes `state?.updatedAt` as `qaCoverageRefreshKey`, causing the badge to re-fetch on every SSE event. Spec: "Fetched on initial load and on `iteration_complete` events where phase is `qa`". The TODO already tracks this as incomplete.

3. **Gate 5 — TypeScript compilation error:** `orchestrate.ts:3526` compares `PrGateStatus` against `"api_error"` but the type union doesn't include it. Introduced in commit `2149734`.

4. **Gate 5 — Test failures:** 23 tests fail across orchestrate/gh/adapter suites. Need triage to separate branch regressions from pre-existing failures.

5. **Gate 6 — Text proof for UI change:** The QACoverageBadge is a visual widget with color-coded states. The proof artifact is a text summary, not a screenshot showing the rendered badge.
