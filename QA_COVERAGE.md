# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| All dashboard tests pass (npm run test) | 2026-03-28 | 274636e | PASS | 350/350 tests pass, 32 test files (3 new tests since last session) |
| isCurrentIteration prop removed from LogEntryRow | 2026-03-27 | a681c80 | PASS | grep confirms zero occurrences in dashboard/src/ |
| ImageLightbox branch coverage ≥90% | 2026-03-28 | 780e0a4 | PASS | 100% branch coverage |
| LogEntryExpandedDetails branch coverage ≥90% | 2026-03-28 | 274636e | PASS | 93.47% branch coverage (was 86.95%, fixed by commit 11c792992) |
| TypeScript type-check (tsc --noEmit) | 2026-03-28 | 274636e | PASS | No type errors |
| aloop status command | 2026-03-28 | 780e0a4 | PASS | Lists active sessions and provider health correctly, exit 0 |
| vitest coverage config includes new components | 2026-03-28 | 274636e | PASS | All extracted components now appear in coverage report (ImageLightbox, LogEntryExpandedDetails, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, SideBySideView, SliderView, LogEntryRow) |
| SliderView.tsx branch coverage ≥90% | 2026-03-28 | 274636e | FAIL | 70% branch coverage (lines 19-26,52 uncovered) — new bug filed [qa/P1] |
| LogEntryRow.tsx branch coverage ≥90% | 2026-03-28 | 274636e | FAIL | 89.15% branch coverage (lines 177-183 uncovered) — new bug filed [qa/P1] |
