# Issue #91: QA Coverage Display: Parse and render QA_COVERAGE.md percentage in dashboard

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Add `GET /api/qa-coverage` endpoint in `dashboard.ts` — read `QA_COVERAGE.md` from workdir, parse percentage with `/Coverage:\s*(\d+)%/i`, return `{ percentage, raw, available }`. Follow existing endpoint pattern (pathname check + readTextFile). ~20 LOC.
- [x] Add `QACoverageBadge` component in `AppView.tsx` — fetch from `/api/qa-coverage`, display color-coded badge (green >=80%, yellow 60-79%, red <60%). Click expands full markdown rendered via `marked`. Use existing `DocContent` pattern for the expanded view. Hidden when `available: false`. ~50-80 LOC.
- [x] Wire `QACoverageBadge` into session detail header area — place near existing phase/status indicators. Re-fetch on SSE `state` events (since no `review_complete` event exists, piggyback on state refresh).
- [ ] Add unit tests — test percentage parsing regex, color thresholds, and graceful missing-file handling. Follow existing `App.coverage.test.ts` patterns with fetch mocking.

### Completed
