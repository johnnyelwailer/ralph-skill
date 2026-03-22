# Issue #117: Cost monitoring: data hook, summary widget & graceful degradation

## Current Phase: Implementation

### In Progress

- [ ] [review] **Gate 1: Sidebar `displaySessionCost` checks `s.id === 'current'` but actual session ID is the full name** (priority: high)
  `AppView.tsx:766-767` — `displaySessionCost()` returns `sessionCost` only when `s.id === 'current'`, but the real current session ID from `/api/sessions` is the full orchestrator name (e.g. `orchestrator-20260321-...`), never literally `'current'`. Fix: identify the current session by matching it against the first/active session or by checking `s.isActive && s.status === 'running'` instead of comparing `s.id === 'current'`. Alternatively, have the SSE `state` event include a `currentSessionId` field and match on that.
  Consolidates: prior review finding #2, QA P1 #2 (sidebar cost still failing at 444992c).

- [ ] [review] **Gate 3: CostDisplay.tsx and dashboard.ts cost routes have zero test coverage — new modules require >=90%** (priority: high)
  `CostDisplay.tsx` (95 lines, new): no test file. `dashboard.ts` cost API routes (~77 lines added): no tests. `useCost.test.ts` exists but is missing branches: `cancelled=true` cleanup path (useCost.ts:89,104), `inFlightRef.current` guard (useCost.ts:79), `toNumber` with NaN-producing string. Write CostDisplay and dashboard cost route tests as already specified in TODO "Up Next" items, and add the missing useCost branches.

### Up Next

- [x] **Add tests for useCost hook** (priority: high)
  New test file for `useCost.ts`. Cover: (a) sessionCost aggregation from log lines with `iteration_complete` events; (b) mock fetch for `/api/cost/aggregate` success response; (c) `opencode_unavailable` error sets totalCost=null and error correctly; (d) HTTP error handling; (e) budget cap and percent calculation from meta; (f) polling interval from meta. Target >=90% branch coverage.

- [ ] **Add tests for CostDisplay component** (priority: high)
  New test file for `CostDisplay.tsx`. Cover: (a) renders progress bar with correct color at 50%/75%/95%; (b) no progress bar when budgetCap is null; (c) "Cost data unavailable" when error='opencode_unavailable' and no sessionCost; (d) shows sessionCost fallback when error='opencode_unavailable' and sessionCost > 0 (after fix above); (e) loading state; (f) warning and pause threshold display. Target >=90% branch coverage.

- [ ] [review] Gate 1: **Sidebar session cards missing per-session cost from log events** — `AppView.tsx:694-728` fetches session costs via `/api/cost/session/:id` (opencode export), which returns null when opencode is unavailable. The per-session cost computed by `useCost` from log.jsonl `iteration_complete` events is never propagated to the sidebar. Fix: for the *current* session, display `sessionCost` from `useCost` in the sidebar card; for other sessions, fall back gracefully when API returns unavailable. (priority: high)

- [ ] [review] Gate 2+3: **Zero test coverage on all new cost modules** — `useCost.ts` (126 lines), `CostDisplay.tsx` (79 lines), and server-side cost routes in `dashboard.ts` (~77 lines, lines 1114-1189) have no tests. New modules require >=90% branch coverage. Write tests covering: (a) `useCost` with mock fetch responses (success, opencode_unavailable, HTTP error), sessionCost aggregation from log lines; (b) `CostDisplay` renders progress bar with correct color class at 50%/75%/95%, handles null budgetCap, handles unavailable state with sessionCost fallback; (c) `/api/cost/aggregate` and `/api/cost/session/:id` routes in dashboard.test.ts with mocked `spawnSync`. (priority: high)

- [ ] [qa/P1] **Per-session cost not displayed when opencode unavailable**: Launched dashboard with `--session-dir` containing log.jsonl with 3 `iteration_complete` events (cost_usd: 0.0034, 0.0125, 0.0078 = $0.0237 total) → CostDisplay shows only "Cost data unavailable" with no dollar amounts anywhere on the page → Spec says "per-session cost from log still works" even when opencode is unavailable, and `sessionCost` should be displayed from SSE log events independently of aggregate cost. Tested at commit b6260bb. (priority: high)

- [ ] [qa/P1] **No per-session cost or duration in sidebar session cards/tooltips**: Hovered and clicked sidebar session entries → cards show only session name, phase label (build/qa/review), and iteration count → Spec and TODO completion note say "added per-session cost+duration details in sidebar cards/tooltips" but neither cost nor duration appears. Tested at commit b6260bb. (priority: high)

- [ ] [qa/P1] **Cost progress bar (green/yellow/red) never renders**: Dashboard header shows "Cost data unavailable" box with no progress bar → Spec requires "color-coded Radix Progress bar (green <70%, yellow 70-90%, red >90%)" and "$X.XX / $Y.YY" format → The cost progress bar is not visible even in degraded mode (where per-session cost should still populate it). The only progress bar visible (80%) is the task completion bar, not cost. Tested at commit b6260bb. (priority: high)

- [ ] **Add tests for server-side cost API routes** (priority: high)
  Tests in `dashboard.test.ts` for `/api/cost/aggregate` and `/api/cost/session/:id`. Cover: (a) successful response with mocked `spawnSync`; (b) `opencode_unavailable` graceful degradation; (c) caching behavior respects `cost_poll_interval_minutes`. Target >=90% branch coverage.

### Completed

- [x] **Add server-side cost API routes to dashboard.ts** — `GET /api/cost/aggregate` and `GET /api/cost/session/:sessionId` with caching and graceful degradation
- [x] **Create useCost hook** — `src/hooks/useCost.ts` with 5-minute polling, session log aggregation, budget metadata parsing, and `opencode_unavailable` graceful fallback
- [x] **Create CostDisplay widget** — `src/components/progress/CostDisplay.tsx` with budget/cap rendering, color-coded progress bar, and unavailable fallback state
- [x] **Integrate CostDisplay into AppView.tsx** — wired `useCost` into `AppView`, rendered `CostDisplay` in header (desktop), and added per-session cost+duration details in sidebar cards/tooltips
