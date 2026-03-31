# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `.github/workflows/ci.yml` exists and is valid YAML | 2026-03-31 | 2d02591e7 | PASS | File exists, YAML parses cleanly, triggers on push+PR to master and agent/trunk |
| CI workflow Node 22 + npm ci setup | 2026-03-31 | 2d02591e7 | PASS | actions/setup-node@v4 with node-version 22, working-directory aloop/cli/dashboard |
| `npm test` runs vitest in dashboard | 2026-03-31 | 2d02591e7 | PASS | 51 test files, 632 tests all pass; jsdom configured; e2e excluded |
| Every component has .test.tsx | 2026-03-31 | 2d02591e7 | PASS | All non-ui components verified — previously 6 missing, now fixed |
| Every component has .stories.tsx | 2026-03-31 | 2d02591e7 | PASS | All non-ui components verified — previously 13 missing, now fixed; ui/sonner.stories.tsx has 1 story but ui/ is excluded per spec |
| TypeScript type-check passes | 2026-03-31 | 613a7bab4 | PASS | Both errors resolved: `afterEach` import added to Sidebar.test.tsx, `iterationStartedAt` added to ActivityPanel.test.tsx baseProps; `tsc --noEmit` exits 0 |
| Static verification of all fixes (final-qa re-run) | 2026-03-31 | a43e2b433 | PASS | Disk full — commands blocked; static checks via Glob/Grep confirm: `afterEach` imported at Sidebar.test.tsx:3, `iterationStartedAt` in baseProps at ActivityPanel.test.tsx:14, all .test.tsx/.stories.tsx files exist, ci.yml correct |
| Full dynamic re-test (final-qa, triggered by final-review) | 2026-03-31 | 6650dcf30 | PASS | Disk space restored; tsc --noEmit exit 0; 51 test files 632 tests exit 0; all .test.tsx/.stories.tsx present; README gaps (PROMPT_spec-review.md missing, finalizer prose incomplete) confirmed still open — tracked as [review] in TODO.md |
