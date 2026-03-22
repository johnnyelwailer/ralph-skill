# Issue #117: Cost monitoring: data hook, summary widget & graceful degradation

## Current Phase: Implementation

### In Progress

- [x] [review] **Gate 3: CostDisplay.test.tsx missing branches for >=90% new-module coverage** (priority: high)
  Added branch tests for fallback-without-cap, no-cap loading state, and independent warnings/pause rendering paths. Verified `CostDisplay.tsx` branch coverage is 97.77%.

### Up Next

- [ ] **Add tests for server-side cost API routes** (priority: high)
  Tests in `dashboard.test.ts` for `/api/cost/aggregate` and `/api/cost/session/:id`. Cover: (a) successful response with mocked `spawnSync`; (b) `opencode_unavailable` graceful degradation; (c) caching behavior respects `cost_poll_interval_minutes`. Target >=90% branch coverage.

- [ ] **Add missing useCost branch coverage** (priority: high)
  Extend `useCost.test.ts` with: (a) `cancelled=true` cleanup path (useCost.ts:89,104); (b) `inFlightRef.current` guard preventing concurrent fetches (useCost.ts:79); (c) `toNumber` with NaN-producing string input. These branches are required for >=90% coverage.

### Completed

- [x] **Add tests for CostDisplay component** — 6 tests covering progress bar colors, no-budget-cap rendering, opencode_unavailable states, loading, and warning/pause metadata
- [x] **Add server-side cost API routes to dashboard.ts** — `GET /api/cost/aggregate` and `GET /api/cost/session/:sessionId` with caching and graceful degradation
- [x] **Create useCost hook** — `src/hooks/useCost.ts` with 5-minute polling, session log aggregation, budget metadata parsing, and `opencode_unavailable` graceful fallback
- [x] **Create CostDisplay widget** — `src/components/progress/CostDisplay.tsx` with budget/cap rendering, color-coded progress bar, and unavailable fallback state
- [x] **Integrate CostDisplay into AppView.tsx** — wired `useCost` into `AppView`, rendered `CostDisplay` in header (desktop), and added per-session cost+duration details in sidebar cards/tooltips
- [x] **Add tests for useCost hook** — 5 tests covering sessionCost aggregation, aggregate fetch, opencode_unavailable handling, HTTP errors, and poll interval from meta
- [x] **Fix sidebar session cost display** — changed `s.id === 'current'` to `s.isActive` in `displaySessionCost()` (c46f487)
