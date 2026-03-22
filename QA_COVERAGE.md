# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Cost API: GET /api/cost/aggregate | 2026-03-22 | b6260bb | PASS | Returns `{"error":"opencode_unavailable"}` with HTTP 200 when opencode CLI not installed. Valid JSON, correct shape per spec. |
| Cost API: GET /api/cost/session/:id | 2026-03-22 | b6260bb | PASS | Returns `{"error":"opencode_unavailable"}` with HTTP 200. Same graceful degradation as aggregate endpoint. |
| CostDisplay widget: graceful degradation text | 2026-03-22 | b6260bb | PASS | Shows "Cost data unavailable" with muted styling when opencode unavailable. Correct per spec. |
| CostDisplay widget: per-session cost from log events | 2026-03-22 | 444992c | PASS | Correctly sums cost_usd from iteration_complete events ($0.0432 from 5 events). Displayed as `$0.0432 session` in header toolbar. Previously FAIL at b6260bb. |
| CostDisplay widget: $X.XX / $Y.YY format with budget cap | 2026-03-22 | 444992c | PASS | SESSION SPEND box shows `$0.04 / $50.00`. Budget cap correctly parsed from meta.json. Previously FAIL at b6260bb. |
| CostDisplay widget: color-coded progress bar (green/yellow/red) | 2026-03-22 | 444992c | PASS | Green (bg-emerald-500) progress bar renders in SESSION SPEND box at low spend (0.08%). Distinct from task progress bar (cyan). Previously FAIL at b6260bb. |
| Per-session cost in sidebar cards/tooltips | 2026-03-22 | 444992c | FAIL | Sidebar tooltip shows PID, Status, Provider, Iterations, Started, Dir — still no cost or duration. Cost IS shown in header toolbar (`$0.0432 session`) but not in sidebar card tooltip. Still failing. |
| Dashboard SSE: log events with cost data | 2026-03-22 | b6260bb | PASS | SSE `/events` endpoint delivers full log.jsonl including iteration_complete events with usage.cost_usd fields. Data is available to the frontend. |
