# Sub-Spec: Issue #117 — Cost monitoring: data hook, summary widget & graceful degradation

## Objective

Implement the cost data fetching layer and the main cost summary widget showing cumulative spend vs budget cap with a color-coded progress bar.

## Context

Cost data comes from two sources: (1) `iteration_complete` events in `log.jsonl` for per-session cost, and (2) `opencode db` CLI queries for aggregate cost across sessions. The `extractIterationUsage()` function already exists in AppView.tsx. See SPEC-ADDENDUM.md § OpenRouter Cost Monitoring for data source details and widget specs.

## Scope

### useCost hook
- `aloop/cli/dashboard/src/hooks/useCost.ts` (new)
- Aggregates cost from `iteration_complete` SSE events (per-session, real-time)
- On mount and every 5 minutes (`cost_poll_interval_minutes` from config): fetches aggregate cost via server API
- Returns: `{ sessionCost, totalCost, budgetCap, budgetUsedPercent, isLoading, error }`
- Graceful degradation: if `opencode` CLI unavailable, returns `totalCost: null` (per-session cost from log still works)

### Server-side cost API
- `GET /api/cost/aggregate` — executes `opencode db` query for total spend, returns JSON `{ total_usd, by_model: [...] }`
- `GET /api/cost/session/<sessionId>` — returns cumulative cost for a specific session from `opencode export`
- Both endpoints return `{ error: "opencode_unavailable" }` with 200 status if CLI not found (graceful degradation)
- Cache `opencode db` results for `cost_poll_interval_minutes` to avoid excessive CLI calls

### CostDisplay widget
- `aloop/cli/dashboard/src/components/progress/CostDisplay.tsx` (new or extend existing)
- Displays in top bar or sidebar header:
  - Cumulative spend: `$X.XX / $Y.YY` (current / cap)
  - Progress bar (Radix Progress component already available)
  - Color coding: green (< 70%), yellow (70-90%), red (> 90%)
- Per-session cost displayed alongside iteration count and duration in session detail
- If no budget cap configured: show spend only, no progress bar
- If `opencode` unavailable: show "Cost data unavailable" with muted styling

### Config
- Read `budget_cap_usd`, `budget_warnings`, `budget_pause_threshold` from `meta.json`
- Read `cost_poll_interval_minutes` from config (default: 5)

## Acceptance Criteria

- [ ] Cost summary widget displays cumulative spend vs budget cap
- [ ] Color-coded progress bar (green/yellow/red)
- [ ] Per-session cost aggregated from `iteration_complete` events in real-time
- [ ] Aggregate cost fetched via `opencode db` every 5 minutes
- [ ] All cost data via `opencode export` or `opencode db` — no internal file access
- [ ] Missing `opencode` CLI degrades gracefully (widget shows unavailable, no errors)
- [ ] Budget cap and thresholds read from `meta.json`

## Files
- `aloop/cli/dashboard/src/hooks/useCost.ts` (new)
- `aloop/cli/dashboard/src/components/progress/CostDisplay.tsx` (new or extend)
- `aloop/cli/src/commands/dashboard.ts` — add `/api/cost/` routes
- `aloop/cli/dashboard/src/AppView.tsx` — integrate CostDisplay widget

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
