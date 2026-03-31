# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `.github/workflows/ci.yml` exists and is valid YAML | 2026-03-31 | 2d02591e7 | PASS | File exists, YAML parses cleanly, triggers on push+PR to master and agent/trunk |
| CI workflow Node 22 + npm ci setup | 2026-03-31 | 2d02591e7 | PASS | actions/setup-node@v4 with node-version 22, working-directory aloop/cli/dashboard |
| `npm test` runs vitest in dashboard | 2026-03-31 | 2d02591e7 | PASS | 51 test files, 632 tests all pass; jsdom configured; e2e excluded |
| Every component has .test.tsx | 2026-03-31 | 2d02591e7 | PASS | All non-ui components verified — previously 6 missing, now fixed |
| Every component has .stories.tsx | 2026-03-31 | 2d02591e7 | PASS | All non-ui components verified — previously 13 missing, now fixed; ui/sonner.stories.tsx has 1 story but ui/ is excluded per spec |
| TypeScript type-check passes | 2026-03-31 | 2d02591e7 | FAIL | 2 errors: ActivityPanel.test.tsx:72 TS2353 (tracked in [review]), Sidebar.test.tsx:240 TS2304 `afterEach` not found (new [qa/P1] filed) |
