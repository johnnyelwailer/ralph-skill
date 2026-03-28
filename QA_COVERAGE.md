# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| All dashboard tests pass (npm run test) | 2026-03-28 | b8fc74a | PASS | 406/406 tests pass, 38 test files (36 new tests since last session — Sidebar, SessionDetail, DocsPanel, MainPanel) |
| isCurrentIteration prop removed from LogEntryRow | 2026-03-27 | a681c80 | PASS | grep confirms zero occurrences in dashboard/src/ |
| ImageLightbox branch coverage ≥90% | 2026-03-28 | 780e0a4 | PASS | 100% branch coverage |
| LogEntryExpandedDetails branch coverage ≥90% | 2026-03-28 | 274636e | PASS | 93.47% branch coverage (was 86.95%, fixed by commit 11c792992) |
| TypeScript type-check (tsc --noEmit) | 2026-03-28 | 9eacb87 | PASS | No type errors |
| aloop status command | 2026-03-28 | 780e0a4 | PASS | Lists active sessions and provider health correctly, exit 0 |
| vitest coverage config includes new components | 2026-03-28 | 274636e | PASS | All extracted components now appear in coverage report (ImageLightbox, LogEntryExpandedDetails, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, SideBySideView, SliderView, LogEntryRow) |
| SliderView.tsx branch coverage ≥90% | 2026-03-28 | 67d41e2 | PASS | 90% branch coverage (was 70%, fixed by commit dcef1ee65) — re-test PASS |
| LogEntryRow.tsx branch coverage ≥90% | 2026-03-28 | 9eacb87 | PASS | 92.77% branch coverage — re-test PASS; callback assertions strengthened (commits 53b4003, 9eacb87) |
| ResponsiveLayout.tsx branch coverage ≥90% | 2026-03-28 | 9eacb87 | PASS | 91.66% branch coverage (was 75% FAIL, fixed by commit 9eacb87) — re-test PASS |
| Sidebar.tsx branch coverage ≥90% | 2026-03-28 | b8fc74a | FAIL | 78.46% branch coverage (below 90% spec requirement) — lines 83,100,159,215 uncovered, bug filed |
| SessionDetail.tsx branch coverage ≥90% | 2026-03-28 | b8fc74a | PASS | 93.75% branch coverage |
| TypeScript type-check (tsc --noEmit) | 2026-03-28 | b8fc74a | PASS | No type errors (re-test after batch 1 extraction) |
| AppView.tsx LOC reduction (batch 1) | 2026-03-28 | b8fc74a | PASS | Reduced from 1299 → 823 LOC (progress toward <100 LOC target, extraction ongoing) |
| Sidebar.tsx LOC ≤200 | 2026-03-28 | b8fc74a | FAIL | 255 LOC — above 200 LOC spec limit, bug filed |
