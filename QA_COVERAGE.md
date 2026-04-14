# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| DocsPanel.tsx extraction (LOC ≤200) | 2026-04-14 | 6a72a5f9 | PASS | 199 LOC — fixed in d9498aa3 |
| Header.tsx extraction (LOC ≤200) | 2026-04-14 | 9899c43a | PASS | 168 LOC — split into StatusIndicators.tsx (98) + QACoverageBadge.tsx (142) |
| StatusIndicators.tsx (new extract from Header.tsx) | 2026-04-14 | 9899c43a | PASS | 98 LOC — contains PhaseBadge, StatusDot, ConnectionIndicator, ElapsedTimer |
| QACoverageBadge.tsx (new extract from Header.tsx) | 2026-04-14 | 9899c43a | PASS | 142 LOC — contains QACoverageBadge with types/helpers |
| Footer.tsx extraction | 2026-04-14 | 6a72a5f9 | PASS | 66 LOC, within limit |
| lib/log.ts LOC (≤200) | 2026-04-14 | 6a72a5f9 | PASS | Split into log-types.ts (101), log-parse.ts (172), log-session.ts (110), log.ts (3) — all within limit |
| DocsPanel duplicate cooldown IIFE | 2026-04-14 | 6a72a5f9 | PASS | Extracted to `remainingSecs` variable — only 1 Math.max occurrence confirmed |
| npm run type-check | 2026-04-14 | 9899c43a | PASS | 0 errors after Header.tsx split |
| npm test | 2026-04-14 | 9899c43a | FAIL | 1077/1111 pass, 33 fail, exit code 1 — pre-existing failures in dashboard/orchestrate/process-requests/github-monitor tests (gh PATH hardening, ReferenceError: state is not defined); bug filed |
| AppView.tsx LOC (<100) | 2026-04-14 | 6a72a5f9 | FAIL | 1393 LOC — main refactoring not yet started; all Up Next tasks pending |
| Dashboard HTML served | 2026-04-14 | 9899c43a | PASS | HTTP 200, JS 463KB + CSS 34KB bundles load; bundle contains StatusIndicators/QACoverageBadge strings |
| SSE /events endpoint | 2026-04-14 | 6a72a5f9 | PASS | Returns live session state and log stream |
| SPEC.md restoration | 2026-04-14 | 6a72a5f9 | PASS | 4086 lines confirmed |
| Gate 7 browser verification (Playwright e2e) | 2026-04-14 | 9899c43a | FAIL | Playwright can't launch — missing libatk-1.0.so.0 in container; curl fallback confirms server/API work; visual rendering unverifiable |
