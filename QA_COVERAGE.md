# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| DocsPanel.tsx extraction (LOC ≤200) | 2026-04-14 | 3d911e69 | FAIL | 204 LOC — still exceeds 200 LOC limit by 4 lines; open bug still unresolved |
| Header.tsx extraction (LOC ≤200) | 2026-04-14 | 3d911e69 | FAIL | 385 LOC — tracked in TODO Up Next as split task |
| Footer.tsx extraction | 2026-04-14 | 3d911e69 | PASS | 66 LOC, within limit |
| npm run type-check | 2026-04-14 | 3d911e69 | PASS | 0 errors — fixed in iter 41 (was 5 errors at iter 1) |
| npm test | 2026-04-14 | 3d911e69 | PASS | 243/243 passing — fixed in iter 41 (was 3 failures at iter 1) |
| AppView.tsx LOC (<100) | 2026-04-14 | 3d911e69 | FAIL | 1393 LOC — main refactoring not yet started; all Up Next tasks pending |
| Dashboard HTML served | 2026-04-14 | 3d911e69 | PASS | Serves correct HTML at port 37055 |
| SSE /events endpoint | 2026-04-14 | 3d911e69 | PASS | Returns live session state and log stream |
