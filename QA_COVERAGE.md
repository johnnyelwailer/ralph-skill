# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Server-side cost API (/api/cost/aggregate) | 2026-03-22 | 17ad170 | FAIL | Endpoint exists, returns 200, but always returns `opencode_unavailable` even when opencode CLI is installed and working |
| Server-side cost API (/api/cost/session) | 2026-03-22 | 17ad170 | FAIL | Same issue — returns `opencode_unavailable` despite opencode being available |
| CostDisplay widget — top bar | 2026-03-22 | 17ad170 | PARTIAL | "Cost data unavailable" text shown with muted styling (correct for degradation). Progress bar exists. But no $X.XX/$Y.YY spend-vs-cap format visible. Budget cap not surfaced. |
| Color-coded progress bar | 2026-03-22 | 17ad170 | FAIL | Progress bar indicator is yellow at 0% spend — should be green per spec (green < 70%, yellow 70-90%, red > 90%) |
| Graceful degradation (no opencode) | 2026-03-22 | 17ad170 | PASS | API returns `{"error":"opencode_unavailable"}` with HTTP 200. Dashboard shows "Cost data unavailable" with muted styling. No crashes or errors. |
| Per-session cost in sidebar | 2026-03-22 | 17ad170 | PASS | Sidebar shows `iter N · $X.XXXX` format for each session. Cost displays $0.0000 (correct given no cost_usd in iteration events). |
| Budget cap from meta.json | 2026-03-22 | 17ad170 | FAIL | meta.json has budget_cap_usd=10.00 but budget cap is not displayed anywhere in the dashboard UI |
