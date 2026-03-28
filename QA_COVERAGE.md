# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| All dashboard tests pass (npm run test) | 2026-03-28 | 780e0a4 | PASS | 347/347 tests pass, 32 test files |
| isCurrentIteration prop removed from LogEntryRow | 2026-03-27 | a681c80 | PASS | grep confirms zero occurrences in dashboard/src/ |
| ImageLightbox branch coverage ≥90% | 2026-03-28 | 780e0a4 | PASS | 100% branch coverage (was 50% last session, non-Escape key test added) |
| LogEntryExpandedDetails branch coverage ≥90% | 2026-03-28 | 780e0a4 | FAIL | 86.95% branch coverage, line 76 still uncovered (was 84.78% last session, improved but still below ≥90%) — new bug filed |
| TypeScript type-check (tsc --noEmit) | 2026-03-28 | 780e0a4 | PASS | No type errors |
| aloop status command | 2026-03-28 | 780e0a4 | PASS | Lists active sessions and provider health correctly, exit 0 |
| vitest coverage config includes new components | 2026-03-27 | a681c80 | FAIL | vitest.config.ts coverage.include does not include newly extracted components (ImageLightbox, LogEntryExpandedDetails, etc.) — bug still open [qa/P2] |
