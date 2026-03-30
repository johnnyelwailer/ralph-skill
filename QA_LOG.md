# QA Log

## QA Session — 2026-03-30 (iteration 60)

### Test Environment
- Working dir: aloop/cli/dashboard/
- Commit: bf074991f
- Features tested: 5

### Results
- PASS: Sidebar branch coverage 95.38% (FIXED — was 78.46% at iter 59)
- PASS: playwright.stories.config.ts dead imports removed (FIXED — was failing at iter 59)
- PASS: DocsPanel overflow tab assertion present and verified
- PASS: All unit tests (437 tests, 38 files — 23 new tests vs iter 59)
- PASS: Storybook build (no errors)

### Bugs Filed
- None — all previously failing items are now resolved

### Re-test Notes
- Sidebar branch coverage: FIXED at 95.38% (commit bf074991f); no longer failing
- playwright.stories.config.ts: FIXED at commit 248e0b314; confirmed clean at bf074991f

### Command Transcript

```
$ npm run test -- --run --reporter=verbose
Test Files: 38 passed (38)
Tests: 437 passed (437)
Duration: 3.31s
Exit code: 0

$ npm run test -- --run --coverage | grep -E "(Sidebar|DocsPanel)"
  DocsPanel.tsx    |     100 |    95.23 |     100 |     100 | 91
  Sidebar.tsx      |     100 |    95.38 |     100 |     100 | 45,73,100

$ cat playwright.stories.config.ts
(only contains: import { defineConfig } from '@playwright/test' + config — no dead imports)

$ npm run build-storybook
Storybook build completed successfully
Exit code: 0
```

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

## QA Session — 2026-03-30 (iteration 61)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260329-152815/worktree/aloop/cli/dashboard
- Commit under test: 5d13e869b (feat: extract Header + QACoverageBadge from AppView.tsx)
- Features tested: 5 (unit tests, Storybook build, Header stories, Header branch coverage, story-screenshot spec coverage)

### Results
- PASS: All unit tests (39 files, 458 tests)
- PASS: Storybook build (no errors)
- PASS: 23 existing story screenshots still render
- PASS: 6 of 7 Header stories render correctly in Playwright
- FAIL: Header.tsx branch coverage 87.61% — below ≥90% threshold
- FAIL: `layout-header--qa-badge-default` story shows "No Preview" in static build
- FAIL: Header stories absent from `e2e/story-screenshots.spec.ts`

### Bugs Filed
- [qa/P1] Header.tsx branch coverage 87.61% — below 90% threshold (lines 130,211,227,275 uncovered)
- [qa/P1] Header stories missing from story-screenshots.spec.ts — 7 stories not screenshot-tested
- [qa/P2] `layout-header--qa-badge-default` story: "No Preview" in static Storybook build

### Command Transcript
```
$ npm test
> vitest run
✓ 39 test files, 458 tests passed

$ npm run build-storybook
→ Storybook build completed successfully

$ npm run test:coverage
→ Header.tsx  | 93.18% stmts | 87.61% branch | 91.66% funcs | 100% lines | uncovered: 130,211,227,275

$ npm run test:e2e:stories
→ 23 passed (34.3s) — Sidebar×6, SessionDetail×5, DocsPanel×6, MainPanel×6

$ cat storybook-static/index.json | python3 -c "... filter header stories"
→ Found: layout-header--{default,loading,disconnected,stopped,no-provider,high-budget-usage,qa-badge-default}

$ python3 -m http.server 6007 --directory storybook-static (background)
$ node /tmp/qa-header-test.mjs
→ layout-header--default: OK (204 chars)
→ layout-header--loading: OK (203 chars)
→ layout-header--disconnected: OK (218 chars)
→ layout-header--stopped: OK (205 chars)
→ layout-header--no-provider: OK (161 chars)
→ layout-header--high-budget-usage: OK (204 chars)
→ layout-header--qa-badge-default: FAILED — #storybook-root is hidden (empty), "No Preview" error
```

---

## QA Session — 2026-03-30 (iteration 62)

### Test Environment
- Working dir: aloop/cli/dashboard/
- Commit: 55caec1a1 (test-strengthening commits: stronger assertions, removed dead mock/import)
- Features re-tested: 4 (all were previously FAIL — re-test to see if fixed)

### Results
- PASS: All unit tests (458 tests, 39 files — no change in count; test assertions strengthened, no new tests)
- PASS: Storybook build (no errors)
- PASS: All 23 existing Playwright story screenshots (no regression)
- PASS: 6/7 Header stories render correctly in dev server (Default, Loading, Disconnected, Stopped, NoProvider, HighBudgetUsage)
- FAIL: Header.tsx branch coverage still 87.61% — test-strengthening commits did NOT cover lines 130,211,227,275
- FAIL: `layout-header--qa-badge-default` still shows empty #storybook-root — confirmed via Playwright headless
- FAIL: Header stories still absent from e2e/story-screenshots.spec.ts — spec has 23 stories (no Header)

### Bugs Filed
- None new — all 3 bugs from iter 61 confirmed still open; re-test notes added below

### Re-test Notes
- iter 62: [qa/P1] Header.tsx branch coverage — still 87.61%, not fixed by iter 62 commits
- iter 62: [qa/P2] qa-badge-default story — still empty #storybook-root, confirmed via Playwright
- iter 62: [qa/P1] Header stories in spec — still missing from story-screenshots.spec.ts

### Command Transcript
```
$ npm run test -- --run
→ 39 files, 458 tests passed

$ npm run build-storybook
→ Storybook build completed successfully

$ npx vitest run --coverage
→ Header.tsx | 93.18% stmts | 87.61% branch | 91.66% funcs | 100% lines | uncovered: 130,211,227,275

$ npx playwright test --config playwright.stories.config.ts
→ 23 passed (34.2s)

$ cat e2e/story-screenshots.spec.ts | grep layout-header
→ (no output — Header stories not in spec)

$ npx storybook dev -p 6007 --ci --no-open &
$ node /tmp/qa-header-playwright.mjs
→ layout-header--default: empty=false, noPreview=false (content rendered OK, len=5653)
→ layout-header--loading: empty=false (len=5652)
→ layout-header--disconnected: empty=false (len=5646)
→ layout-header--stopped: empty=false (len=5491)
→ layout-header--no-provider: empty=false (len=5352)
→ layout-header--high-budget-usage: empty=false (len=5645)
→ layout-header--qa-badge-default: empty=true — #storybook-root empty, No Preview
```
