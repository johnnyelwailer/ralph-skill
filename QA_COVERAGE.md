# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Extract helper functions to lib/ | 2026-03-31 | 43d23b33f | PASS | All 470 unit tests pass; deriveProviderHealth.test.tsx and parseLogLine.test.tsx resolve correctly |
| Extract CommandPalette + useDashboardState | 2026-03-31 | bfc392e0a | PASS | AppView.tsx at 96 LOC (target <100); CommandPalette exists at 48 LOC; useDashboardState exists at 312 LOC |
| Storybook story screenshots (30 stories) | 2026-03-31 | bfc392e0a | PASS | 29 pass, 1 skipped (qa-badge-default — intentional, pre-existing P2 bug, MSW mock missing) |
| useDashboardState split + coverage | 2026-03-31 | 86ce4388a | PARTIAL | useDashboardState.ts 95.68% branch (PASS); useSSEConnection.ts 65.38% branch (FAIL, ≥90% required, no dedicated test file) |
| logHelpers.ts / sessionHelpers.ts coverage | 2026-03-31 | 86ce4388a | FAIL | Both in vitest.config.ts include; logHelpers 82.14% branch (FAIL), sessionHelpers 70% branch (FAIL), both require ≥90% |
| AppView.tsx branch coverage ≥80% | 2026-03-31 | 86ce4388a | PASS | 88.37% branch, 96 LOC (target <100 LOC) — both pass |
| Storybook story screenshots (30 stories) | 2026-03-31 | 86ce4388a | PASS | 29 pass, 1 skipped (qa-badge-default — intentional P2, MSW mock missing) |
| logHelpers.ts branch coverage ≥90% | 2026-03-31 | 324ee6f5f | PASS | 100% branch — bug fixed, re-verified at iter 7 |
| sessionHelpers.ts branch coverage ≥90% | 2026-03-31 | 324ee6f5f | PASS | 90% branch — bug fixed, re-verified at iter 7 |
| useSSEConnection.ts branch coverage ≥90% | 2026-03-31 | 911184c87 | PASS | 90% branch — null-guard removal unblocked coverage; re-verified at iter 8 |
| providerHealth existence-check anti-pattern | 2026-03-31 | af48de948 | PASS | All 3 tests now use toEqual with specific shapes — null meta → [], enabled_providers → named entries, round_robin_order fallback |
| useDashboardState.ts LOC | 2026-03-31 | 324ee6f5f | MARGINAL | 226 LOC (SPEC target <200; above limit but below 300 code-smell threshold) |
| useSSEConnection.test.ts state assertion anti-pattern | 2026-03-31 | 911184c87 | PASS | Line 111 uses toEqual with exact object {log,activeSessions,recentSessions} — no longer existence-check |
| Split Header.tsx <200 LOC | 2026-03-31 | 911184c87 | FAIL | 280 LOC — violates <200 SPEC rule; tracked in TODO.md Up Next |
| Split Sidebar.tsx <200 LOC | 2026-03-31 | 911184c87 | FAIL | 255 LOC — violates <200 SPEC rule; tracked in TODO.md Up Next |
