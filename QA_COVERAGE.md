# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Cost API: GET /api/cost/aggregate | 2026-03-22 | b6260bb | PASS | Returns `{"error":"opencode_unavailable"}` with HTTP 200 when opencode CLI not installed. Valid JSON, correct shape per spec. |
| Cost API: GET /api/cost/session/:id | 2026-03-22 | b6260bb | PASS | Returns `{"error":"opencode_unavailable"}` with HTTP 200. Same graceful degradation as aggregate endpoint. |
| CostDisplay widget: graceful degradation text | 2026-03-22 | b6260bb | PASS | Shows "Cost data unavailable" with muted styling when opencode unavailable. Correct per spec. |
| CostDisplay widget: per-session cost from log events | 2026-03-22 | b6260bb | FAIL | No dollar amounts displayed anywhere despite log.jsonl containing cost_usd values in iteration_complete events. Bug filed. |
| CostDisplay widget: $X.XX / $Y.YY format with budget cap | 2026-03-22 | b6260bb | FAIL | Never renders. Cost widget only shows "Cost data unavailable" or "SPEND / Loading...", never the spend/cap format. Bug filed. |
| CostDisplay widget: color-coded progress bar (green/yellow/red) | 2026-03-22 | b6260bb | FAIL | Cost progress bar never appears. Only visible progress bar is task completion (80%), not cost. Bug filed. |
| Per-session cost in sidebar cards/tooltips | 2026-03-22 | b6260bb | FAIL | Sidebar cards show session name, phase label, iteration count only. No cost or duration displayed. Bug filed. |
| Dashboard SSE: log events with cost data | 2026-03-22 | b6260bb | PASS | SSE `/events` endpoint delivers full log.jsonl including iteration_complete events with usage.cost_usd fields. Data is available to the frontend. |
