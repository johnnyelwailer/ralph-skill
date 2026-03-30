# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Storybook build (`npm run build-storybook`) | 2026-03-30 | 538bfeb42 | PASS | builds to storybook-static/ without errors |
| All unit tests (vitest) | 2026-03-30 | 538bfeb42 | PASS | 38 files, 406 tests |
| Playwright story screenshots (23 stories) | 2026-03-30 | 538bfeb42 | PASS | Sidebar×6, SessionDetail×5, DocsPanel×6, MainPanel×6 all render at 1280×720 |
| Proof artifacts in proof-artifacts/ | 2026-03-30 | 538bfeb42 | PASS | 50 valid PNG files committed at repo root |
| DocsPanel branch coverage ≥90% | 2026-03-30 | 83b9b9468 | PASS | 95.23% — useEffect reset branch now covered |
| Sidebar branch coverage ≥90% | 2026-03-30 | 83b9b9468 | FAIL | 78.46% — uncovered context menu branches at lines 83,100,159,215 (still failing at iter 59) |
| playwright.stories.config.ts unused imports | 2026-03-30 | 83b9b9468 | FAIL | Gate 4 fix incomplete: `currentDir` defined but unused; `path`/`fileURLToPath` imports are dead code |
