# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| DocsPanel.tsx extraction (LOC ≤200) | 2026-04-14 | 6a72a5f9 | PASS | 199 LOC — fixed in d9498aa3 |
| Header.tsx extraction (LOC ≤200) | 2026-04-14 | 6a72a5f9 | FAIL | 385 LOC — tracked in TODO Up Next as split task |
| Footer.tsx extraction | 2026-04-14 | 6a72a5f9 | PASS | 66 LOC, within limit |
| lib/log.ts LOC (≤200) | 2026-04-14 | 6a72a5f9 | PASS | Split into log-types.ts (101), log-parse.ts (172), log-session.ts (110), log.ts (3) — all within limit |
| DocsPanel duplicate cooldown IIFE | 2026-04-14 | 6a72a5f9 | PASS | Extracted to `remainingSecs` variable — only 1 Math.max occurrence confirmed |
| npm run type-check | 2026-04-14 | 6a72a5f9 | PASS | 0 errors |
| npm test | 2026-04-14 | 6a72a5f9 | PASS | 250/250 passing |
| AppView.tsx LOC (<100) | 2026-04-14 | 6a72a5f9 | FAIL | 1393 LOC — main refactoring not yet started; all Up Next tasks pending |
| Dashboard HTML served | 2026-04-14 | 6a72a5f9 | PASS | Serves correct HTML at port 4173 with full JS/CSS bundles (200 OK) |
| SSE /events endpoint | 2026-04-14 | 6a72a5f9 | PASS | Returns live session state and log stream |
| SPEC.md restoration | 2026-04-14 | 6a72a5f9 | PASS | 4086 lines confirmed |
| Gate 7 browser verification (Playwright e2e) | 2026-04-14 | 6a72a5f9 | FAIL | Playwright can't launch — missing libatk-1.0.so.0 in container; curl fallback confirms server/API work; visual rendering unverifiable |
