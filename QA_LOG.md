# QA Log

## QA Session — 2026-03-30 (iteration 59)

### Test Environment
- Working dir: aloop/cli/dashboard/
- Commit: 83b9b9468
- Features tested: 5

### Results
- PASS: DocsPanel branch coverage 95.23% (FIXED — was 85.71% at iter 58)
- PASS: Storybook build (no errors)
- PASS: All unit tests (414 tests, 38 files)
- FAIL: Sidebar branch coverage 78.46% (unchanged, lines 83,100,159,215 still uncovered)
- FAIL: playwright.stories.config.ts — Gate 4 fix incomplete (unused `currentDir` + dead imports)

### Bugs Filed
- [qa/P1] playwright.stories.config.ts still has unused variable: `currentDir` at line 5 is dead code (renamed from `artifactDir`, never used); `path` and `fileURLToPath` imports also dead. Tested at iter 59.

### Re-test Notes
- Sidebar branch coverage 78.46%: still failing at iter 59 (commit 83b9b9468), same uncovered lines 83,100,159,215

### Command Transcript

```
$ npm run test -- --run --reporter=verbose
Test Files: 38 passed (38)
Tests: 414 passed (414)
Duration: 3.21s
Exit code: 0

$ npm run test -- --run --coverage 2>&1 | grep "DocsPanel\|Sidebar"
  DocsPanel.tsx    |     100 |    95.23 |     100 |     100 | 91
  Sidebar.tsx      |   90.32 |    78.46 |   84.61 |   92.85 | ...83,100,159,215

$ npm run build-storybook
→ Storybook build completed successfully (exit 0)
→ Output: storybook-static/

$ grep -n "currentDir\|artifactDir" playwright.stories.config.ts
5:const currentDir = path.dirname(fileURLToPath(import.meta.url));
→ defined but never referenced in defineConfig
→ imports path/fileURLToPath (lines 1-2) also dead code
```

---

## QA Session — 2026-03-30 (iteration 58)

### Test Environment
- Working dir: aloop/cli/dashboard/
- Commit: 538bfeb42
- Features tested: 5

### Results
- PASS: Storybook build, all unit tests (406), Playwright story screenshots (23), proof-artifacts validity
- FAIL: DocsPanel branch coverage 85.71% (need ≥90%), Sidebar branch coverage 78.46% (need ≥90%)

### Bugs Filed
- Already tracked: [qa/P1] DocsPanel.tsx branch coverage 85.71% (re-test note added — still failing at iter 58)
- Already tracked: [qa/P1] Sidebar.tsx branch coverage 78.46% (re-test note added — still failing at iter 58)

### Command Transcript

```
$ npm run test
→ 38 test files, 406 tests passed (exit 0)

$ npm run test:coverage 2>&1 | grep "DocsPanel\|Sidebar"
  DocsPanel.tsx    |   95.23 |    85.71 |     100 |   94.73 | 37
  Sidebar.tsx      |   90.32 |    78.46 |   84.61 |   92.85 | 83,100,159,215

$ npm run build-storybook
→ Storybook build completed successfully (exit 0)
→ Output: storybook-static/

$ npx playwright test --config=playwright.stories.config.ts
→ 23 passed (35.1s) (exit 0)
  Tests: sidebar×6, sessiondetail×5, docspanel×6, mainpanel×6

$ python3 -c "(verify PNG headers on proof-artifacts)"
→ docspanel-default.png: PNG=True, 1280x720
→ mainpanel-default.png: PNG=True, 1280x720
→ sidebar-default.png: PNG=True, 1280x720
```
