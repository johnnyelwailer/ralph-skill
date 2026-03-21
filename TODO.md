# Issue #117: Cost monitoring: data hook, summary widget & graceful degradation

## Current Phase: Implementation

### In Progress

### Up Next

- [ ] **Add tests for server-side cost API routes** (priority: high)
  Unit tests in `dashboard.test.ts` for `/api/cost/aggregate` and `/api/cost/session/:id` — covering successful response, `opencode` unavailable graceful degradation, and caching behavior.

- [ ] **Add tests for useCost hook and CostDisplay widget** (priority: high)
  Test `useCost` hook with mock SSE events and fetch responses. Test `CostDisplay` renders correct color coding, handles missing budget cap, and shows unavailable state.

### Completed

- [x] **Add server-side cost API routes to dashboard.ts** — `GET /api/cost/aggregate` and `GET /api/cost/session/:sessionId` with caching and graceful degradation
- [x] **Create useCost hook** — `src/hooks/useCost.ts` with 5-minute polling, session log aggregation, budget metadata parsing, and `opencode_unavailable` graceful fallback
- [x] **Create CostDisplay widget** — `src/components/progress/CostDisplay.tsx` with budget/cap rendering, color-coded progress bar, and unavailable fallback state
- [x] **Integrate CostDisplay into AppView.tsx** — wired `useCost` into `AppView`, rendered `CostDisplay` in header (desktop), and added per-session cost+duration details in sidebar cards/tooltips
