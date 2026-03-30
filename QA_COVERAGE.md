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
