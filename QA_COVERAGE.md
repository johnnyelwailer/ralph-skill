# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| DocsPanel.tsx extraction (LOC ≤200) | 2026-04-14 | 90c20275 | FAIL | 204 LOC — exceeds 200 LOC limit by 4 lines; bug filed |
| Header.tsx extraction (LOC ≤200) | 2026-04-14 | 90c20275 | FAIL | 385 LOC — known issue, split task tracked in TODO Up Next |
| Footer.tsx extraction | 2026-04-14 | 90c20275 | PASS | 66 LOC, within limit |
| npm run type-check | 2026-04-14 | 90c20275 | FAIL | 5 TypeScript errors across App.coverage.test.ts and DocsPanel.test.tsx; bug filed |
| npm test | 2026-04-14 | 90c20275 | FAIL | 3/243 tests failing (App.coverage.test.ts); bug filed |
