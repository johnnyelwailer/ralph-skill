# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Storybook build (`npm run build-storybook`) | 2026-03-30 | 538bfeb42 | PASS | builds to storybook-static/ without errors |
| All unit tests (vitest) | 2026-03-30 | 538bfeb42 | PASS | 38 files, 406 tests |
| Playwright story screenshots (23 stories) | 2026-03-30 | 538bfeb42 | PASS | Sidebar×6, SessionDetail×5, DocsPanel×6, MainPanel×6 all render at 1280×720 |
| Proof artifacts in proof-artifacts/ | 2026-03-30 | 538bfeb42 | PASS | 50 valid PNG files committed at repo root |
| DocsPanel branch coverage ≥90% | 2026-03-30 | 83b9b9468 | PASS | 95.23% — useEffect reset branch now covered |
| Sidebar branch coverage ≥90% | 2026-03-30 | bf074991f | PASS | 95.38% — context menu, collapse toggle, cost API, collapsed state all covered |
| playwright.stories.config.ts unused imports | 2026-03-30 | bf074991f | PASS | All dead imports removed; only `defineConfig` import remains |
| DocsPanel overflow tab assertion | 2026-03-30 | bf074991f | PASS | `switches to overflow tab via dropdown menu` now asserts active tab state |
| All unit tests (vitest) | 2026-03-30 | bf074991f | PASS | 38 files, 437 tests (23 new tests vs iter 59) |
| Storybook build (`npm run build-storybook`) | 2026-03-30 | bf074991f | PASS | builds to storybook-static/ without errors |
| All unit tests (vitest) | 2026-03-30 | 5d13e869b | PASS | 39 files, 458 tests (21 new tests — Header component) |
| Storybook build (`npm run build-storybook`) | 2026-03-30 | 5d13e869b | PASS | builds successfully with new Header stories |
| Header stories render (6/7 stories) | 2026-03-30 | 5d13e869b | FAIL | 6 Header stories render at 1280×720; `qa-badge-default` shows "No Preview" — bug filed |
| Header branch coverage ≥90% | 2026-03-30 | 5d13e869b | FAIL | 87.61% — below threshold; uncovered branches at lines 130,211,227,275 — bug filed |
| Header stories in story-screenshots.spec.ts | 2026-03-30 | 5d13e869b | FAIL | Header.stories.tsx has 7 stories but none in e2e/story-screenshots.spec.ts — bug filed |
| Playwright story screenshots (23 stories) | 2026-03-30 | 5d13e869b | PASS | All 23 existing story screenshots still render correctly |
| All unit tests (vitest) | 2026-03-30 | 55caec1a1 | PASS | 39 files, 458 tests — no regression after test-strengthening commits |
| Storybook build (`npm run build-storybook`) | 2026-03-30 | 55caec1a1 | PASS | builds to storybook-static/ without errors |
| Header branch coverage ≥90% | 2026-03-30 | 55caec1a1 | FAIL | still 87.61% — test-strengthening commits did not add branch coverage; lines 130,211,227,275 still uncovered |
| Header stories in story-screenshots.spec.ts | 2026-03-30 | 55caec1a1 | FAIL | still 23 stories only; Header stories not added to spec |
| Header stories render (6/7) in dev server | 2026-03-30 | 55caec1a1 | PASS | Default/Loading/Disconnected/Stopped/NoProvider/HighBudgetUsage render OK via Playwright |
| `layout-header--qa-badge-default` story | 2026-03-30 | 55caec1a1 | FAIL | still empty #storybook-root; confirmed via Playwright headless browser |
| Playwright story screenshots (23 stories) | 2026-03-30 | 55caec1a1 | PASS | all 23 existing story screenshots still pass |
