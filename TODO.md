# Issue #91: QA Coverage Display: Parse and render QA_COVERAGE.md percentage in dashboard

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Add `GET /api/qa-coverage` endpoint in `dashboard.ts` — read `QA_COVERAGE.md` from workdir, parse percentage with `/Coverage:\s*(\d+)%/i`, return `{ percentage, raw, available }`. Follow existing endpoint pattern (pathname check + readTextFile). ~20 LOC.
- [x] Add `QACoverageBadge` component in `AppView.tsx` — fetch from `/api/qa-coverage`, display color-coded badge (green >=80%, yellow 60-79%, red <60%). Click expands full markdown rendered via `marked`. Use existing `DocContent` pattern for the expanded view. Hidden when `available: false`. ~50-80 LOC.
- [x] Wire `QACoverageBadge` into session detail header area — place near existing phase/status indicators. Re-fetch on SSE `state` events (since no `review_complete` event exists, piggyback on state refresh).
- [ ] Add unit tests — test percentage parsing regex, color thresholds, and graceful missing-file handling. Follow existing `App.coverage.test.ts` patterns with fetch mocking.
- [ ] [review] Gate 3: `QACoverageBadge` component in `AppView.tsx:908-971` has zero frontend test coverage — add vitest tests covering: (1) renders null when `available: false`, (2) renders green badge at 80%, yellow at 65%, red at 50%, (3) click toggles expanded markdown panel, (4) shows "QA N/A" when percentage is null. Follow `App.coverage.test.ts` pattern with fetch mocking. (priority: high)
- [ ] [review] Gate 5: `useIsTouchLikePointer.test.ts` — 5 tests fail when run from the root vitest config (`window is not defined`). The tests only pass when run from `dashboard/` with its jsdom vitest config. Ensure the root-level `npm run test` or vitest invocation includes these tests correctly, or add `// @vitest-environment jsdom` pragma to the test file so it works regardless of entry point. (priority: medium)

### Completed
