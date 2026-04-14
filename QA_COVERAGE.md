# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| DocsPanel.tsx extraction (LOC ≤200) | 2026-04-14 | 70094e0f | FAIL | 204 LOC — still 4 lines over limit; open `[qa/P1]` bug unresolved |
| Header.tsx extraction (LOC ≤200) | 2026-04-14 | 70094e0f | FAIL | 385 LOC — tracked in TODO Up Next as split task |
| Footer.tsx extraction | 2026-04-14 | 70094e0f | PASS | 66 LOC, within limit |
| lib/log.ts LOC (≤200) | 2026-04-14 | 70094e0f | FAIL | 381 LOC — tracked as Gate 4 review item; split required |
| DocsPanel duplicate cooldown IIFE | 2026-04-14 | 70094e0f | FAIL | Duplicate Math.max IIFE at lines 179 and 195 — Gate 4 open |
| npm run type-check | 2026-04-14 | 70094e0f | PASS | 0 errors — still clean after new test additions |
| npm test | 2026-04-14 | 70094e0f | PASS | 250/250 passing — +7 DocsPanel branch-coverage tests vs iter 41 |
| AppView.tsx LOC (<100) | 2026-04-14 | 70094e0f | FAIL | 1393 LOC — main refactoring not yet started; all Up Next tasks pending |
| Dashboard HTML served | 2026-04-14 | 3d911e69 | PASS | Serves correct HTML at port 37055 (not re-tested this session) |
| SSE /events endpoint | 2026-04-14 | 3d911e69 | PASS | Returns live session state and log stream (not re-tested this session) |
