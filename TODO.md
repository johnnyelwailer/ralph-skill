# Issue #91: QA Coverage Display: Parse and render QA_COVERAGE.md percentage in dashboard

## Current Phase: Implementation

### In Progress

### Up Next

### Deferred
- [ ] Add unit tests for `QACoverageBadge` — test percentage parsing regex, color thresholds, expand toggle, fetch mocking, and graceful missing-file handling. Covers [review] Gate 3 findings: (1) renders null when `available: false`, (2) renders green badge at 80%, yellow at 65%, red at 50%, (3) click toggles expanded markdown panel, (4) shows "QA N/A" when percentage is null. Follow `App.coverage.test.ts` pattern. *(Deferred: SPEC §Priority Note says dashboard test coverage comes after loop and orchestrator core features are complete.)*
- [x] [review] Gate 5: `useIsTouchLikePointer.test.ts` — 5 tests fail when run from the root vitest config (`window is not defined`). Add `// @vitest-environment jsdom` pragma to the test file so it works regardless of entry point. *(Deferred: pre-existing test config issue unrelated to this feature; dashboard test infra is low priority per SPEC.)*

### Completed
- [x] Add `GET /api/qa-coverage` endpoint in `dashboard.ts` — read `QA_COVERAGE.md` from workdir, parse percentage with `/Coverage:\s*(\d+)%/i`, return `{ percentage, raw, available }`. Follow existing endpoint pattern (pathname check + readTextFile). ~20 LOC.
- [x] Add `QACoverageBadge` component in `AppView.tsx` — fetch from `/api/qa-coverage`, display color-coded badge (green >=80%, yellow 60-79%, red <60%). Click expands full markdown rendered via `marked`. Use existing `DocContent` pattern for the expanded view. Hidden when `available: false`. ~50-80 LOC.
- [x] Wire `QACoverageBadge` into session detail header area — place near existing phase/status indicators. Re-fetch on SSE `state` events (since no `review_complete` event exists, piggyback on state refresh).
