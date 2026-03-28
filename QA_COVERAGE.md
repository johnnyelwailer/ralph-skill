# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| All dashboard tests pass (npm run test) | 2026-03-28 | 67d41e2 | PASS | 368/368 tests pass, 34 test files (18 new tests since last session) |
| isCurrentIteration prop removed from LogEntryRow | 2026-03-27 | a681c80 | PASS | grep confirms zero occurrences in dashboard/src/ |
| ImageLightbox branch coverage ≥90% | 2026-03-28 | 780e0a4 | PASS | 100% branch coverage |
| LogEntryExpandedDetails branch coverage ≥90% | 2026-03-28 | 274636e | PASS | 93.47% branch coverage (was 86.95%, fixed by commit 11c792992) |
| TypeScript type-check (tsc --noEmit) | 2026-03-28 | 67d41e2 | PASS | No type errors |
| aloop status command | 2026-03-28 | 780e0a4 | PASS | Lists active sessions and provider health correctly, exit 0 |
| vitest coverage config includes new components | 2026-03-28 | 274636e | PASS | All extracted components now appear in coverage report (ImageLightbox, LogEntryExpandedDetails, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, SideBySideView, SliderView, LogEntryRow) |
| SliderView.tsx branch coverage ≥90% | 2026-03-28 | 67d41e2 | PASS | 90% branch coverage (was 70%, fixed by commit dcef1ee65) — re-test PASS |
| LogEntryRow.tsx branch coverage ≥90% | 2026-03-28 | 67d41e2 | PASS | 93.97% branch coverage (was 89.15%, fixed by commit 67d41e26d) — re-test PASS |
| ResponsiveLayout.tsx branch coverage ≥90% | 2026-03-28 | 67d41e2 | FAIL | 75% branch coverage (lines 45, 92 uncovered) — new bug filed [qa/P1] |
