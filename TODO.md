# Issue #117: Cost monitoring: data hook, summary widget & graceful degradation

## Current Phase: Implementation

### In Progress

### Up Next

- [ ] [review] Gate 1: **CostDisplay must show sessionCost when opencode unavailable** — `CostDisplay.tsx:35-41` exits early with "Cost data unavailable" when `error === 'opencode_unavailable'`, hiding `sessionCost` from log events. The component doesn't accept a `sessionCost` prop at all. Fix: add `sessionCost` prop to `CostDisplayProps`, display `$X.XX` (session spend) even when aggregate cost is unavailable, and show the progress bar against budget cap using session cost as fallback. Spec refs: TASK_SPEC.md acceptance criteria, SPEC-ADDENDUM.md lines 332-334, 372. (priority: high)

- [ ] [review] Gate 1: **Sidebar session cards missing per-session cost from log events** — `AppView.tsx:694-728` fetches session costs via `/api/cost/session/:id` (opencode export), which returns null when opencode is unavailable. The per-session cost computed by `useCost` from log.jsonl `iteration_complete` events is never propagated to the sidebar. Fix: for the *current* session, display `sessionCost` from `useCost` in the sidebar card; for other sessions, fall back gracefully when API returns unavailable. (priority: high)

- [ ] [review] Gate 2+3: **Zero test coverage on all new cost modules** — `useCost.ts` (126 lines), `CostDisplay.tsx` (79 lines), and server-side cost routes in `dashboard.ts` (~77 lines, lines 1114-1189) have no tests. New modules require >=90% branch coverage. Write tests covering: (a) `useCost` with mock fetch responses (success, opencode_unavailable, HTTP error), sessionCost aggregation from log lines; (b) `CostDisplay` renders progress bar with correct color class at 50%/75%/95%, handles null budgetCap, handles unavailable state with sessionCost fallback; (c) `/api/cost/aggregate` and `/api/cost/session/:id` routes in dashboard.test.ts with mocked `spawnSync`. (priority: high)

- [ ] [qa/P1] **Per-session cost not displayed when opencode unavailable**: Launched dashboard with `--session-dir` containing log.jsonl with 3 `iteration_complete` events (cost_usd: 0.0034, 0.0125, 0.0078 = $0.0237 total) → CostDisplay shows only "Cost data unavailable" with no dollar amounts anywhere on the page → Spec says "per-session cost from log still works" even when opencode is unavailable, and `sessionCost` should be displayed from SSE log events independently of aggregate cost. Tested at commit b6260bb. (priority: high)

- [ ] [qa/P1] **No per-session cost or duration in sidebar session cards/tooltips**: Hovered and clicked sidebar session entries → cards show only session name, phase label (build/qa/review), and iteration count → Spec and TODO completion note say "added per-session cost+duration details in sidebar cards/tooltips" but neither cost nor duration appears. Tested at commit b6260bb. (priority: high)

- [ ] [qa/P1] **Cost progress bar (green/yellow/red) never renders**: Dashboard header shows "Cost data unavailable" box with no progress bar → Spec requires "color-coded Radix Progress bar (green <70%, yellow 70-90%, red >90%)" and "$X.XX / $Y.YY" format → The cost progress bar is not visible even in degraded mode (where per-session cost should still populate it). The only progress bar visible (80%) is the task completion bar, not cost. Tested at commit b6260bb. (priority: high)

- [ ] **Add tests for server-side cost API routes** (priority: high)
  Unit tests in `dashboard.test.ts` for `/api/cost/aggregate` and `/api/cost/session/:id` — covering successful response, `opencode` unavailable graceful degradation, and caching behavior.

- [ ] **Add tests for useCost hook and CostDisplay widget** (priority: high)
  Test `useCost` hook with mock SSE events and fetch responses. Test `CostDisplay` renders correct color coding, handles missing budget cap, and shows unavailable state.

### Completed

- [x] **Add server-side cost API routes to dashboard.ts** — `GET /api/cost/aggregate` and `GET /api/cost/session/:sessionId` with caching and graceful degradation
- [x] **Create useCost hook** — `src/hooks/useCost.ts` with 5-minute polling, session log aggregation, budget metadata parsing, and `opencode_unavailable` graceful fallback
- [x] **Create CostDisplay widget** — `src/components/progress/CostDisplay.tsx` with budget/cap rendering, color-coded progress bar, and unavailable fallback state
- [x] **Integrate CostDisplay into AppView.tsx** — wired `useCost` into `AppView`, rendered `CostDisplay` in header (desktop), and added per-session cost+duration details in sidebar cards/tooltips
