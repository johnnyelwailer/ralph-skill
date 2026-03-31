# QA Log

## QA Session — 2026-03-31 (iteration 5)

### Test Environment
- Dashboard dir: aloop/cli/dashboard
- Host: orchestrator-20260321-172932-issue-183-20260330-144402 worktree
- Features tested: 3

### Results
- PASS: Extract helper functions to lib/ (all 470 unit tests pass)
- PASS: Extract CommandPalette + useDashboardState (AppView.tsx at 96 LOC)
- PASS: Storybook story screenshots (29/30 pass, 1 skipped — intentional pre-existing skip)

### Bugs Filed
None — all tested features pass.

### Command Transcript

```
$ cd aloop/cli/dashboard && npm test -- --reporter=verbose
470 tests passed, 0 failures, 40 test files
Duration: 4.88s
Exit code: 0

$ wc -l src/AppView.tsx
96 src/AppView.tsx
Exit code: 0

$ wc -l src/components/shared/CommandPalette.tsx
48 src/components/shared/CommandPalette.tsx
Exit code: 0

$ wc -l src/hooks/useDashboardState.ts
312 src/hooks/useDashboardState.ts
Exit code: 0

$ ls src/lib/
activityLogHelpers.ts  ansi.test.ts  ansi.ts  deriveProviderHealth.ts
format.test.ts  format.ts  logHelpers.ts  sessionHelpers.ts  types.ts  utils.ts
Exit code: 0

$ ls src/components/shared/
CommandPalette.stories.tsx  CommandPalette.test.tsx  CommandPalette.tsx
ElapsedTimer.stories.tsx  ElapsedTimer.test.tsx  ElapsedTimer.tsx
PhaseBadge.stories.tsx  PhaseBadge.test.tsx  PhaseBadge.tsx
StatusDot.stories.tsx  StatusDot.test.tsx  StatusDot.tsx
Exit code: 0

$ ls src/hooks/
useDashboardState.ts  useBreakpoint.ts  useCost.ts  useIsTouchDevice.ts  useLongPress.ts  (+ test files)
Exit code: 0

$ npx playwright test --config playwright.stories.config.ts
29 passed, 1 skipped (qa-badge-default — intentional pre-existing skip, needs MSW mock)
Duration: 44.9s
Exit code: 0
```

## QA Session — 2026-03-31 (iteration 6 / commit 86ce4388a)

### Test Environment
- Binary under test: /tmp/aloop-test-install-XaU2GF/bin/aloop (version 1.0.0)
- Dashboard dir: aloop/cli/dashboard
- Features tested: 4

### Results
- PARTIAL: useDashboardState split + useSSEConnection coverage — useDashboardState.ts at 95.68% branch (PASS), useSSEConnection.ts at 65.38% branch (FAIL)
- FAIL: logHelpers.ts / sessionHelpers.ts branch coverage — 82.14% and 70% respectively (both require ≥90%)
- PASS: AppView.tsx branch coverage 88.37% (≥80% threshold), LOC 96 (<100 target)
- PASS: Storybook story screenshots — 29 pass, 1 intentionally skipped

### Bugs Filed
- [qa/P1] useSSEConnection.ts branch coverage 65.38% — no dedicated test file, fails ≥90% Gate 1+3 requirement
- [qa/P1] logHelpers.ts branch coverage 82.14% — fails ≥90% requirement
- [qa/P1] sessionHelpers.ts branch coverage 70% — fails ≥90% requirement

### Command Transcript

```
$ npm --prefix aloop/cli run test-install -- --keep | tail -1
/tmp/aloop-test-install-XaU2GF/bin/aloop
Exit code: 0

$ /tmp/aloop-test-install-XaU2GF/bin/aloop --version
1.0.0
Exit code: 0

$ cd aloop/cli/dashboard && npm test -- --reporter=verbose
518 tests passed, 0 failures, 41 test files
Duration: 5.72s
Exit code: 0

$ npm run test:coverage
Coverage report (key files):
  AppView.tsx:            88.37% branch (PASS ≥80%)
  useDashboardState.ts:  95.68% branch (PASS ≥90%)
  useSSEConnection.ts:   65.38% branch (FAIL — requires ≥90%, uncovered lines 51, 83)
  logHelpers.ts:         82.14% branch (FAIL — requires ≥90%, uncovered lines 29,36,42-43)
  sessionHelpers.ts:     70% branch    (FAIL — requires ≥90%, uncovered line 10)
Exit code: 0

$ wc -l src/hooks/useSSEConnection.ts src/hooks/useDashboardState.ts
109  useSSEConnection.ts  (PASS ≤200)
226  useDashboardState.ts (above 200-line SPEC limit — marginal)

$ ls src/hooks/useSSEConnection*.test* 2>/dev/null
(no output — no dedicated test file exists for useSSEConnection.ts)

$ npx playwright test --config playwright.stories.config.ts
29 passed, 1 skipped
Duration: 43.6s
Exit code: 0

$ npx playwright test --config playwright.config.ts
10 passed, 1 skipped
Duration: 7m 36s
Exit code: 0

$ rm -rf /tmp/aloop-test-install-XaU2GF  # cleanup
Exit code: 0
```

## QA Session — 2026-03-31 (iteration 7 / commit 324ee6f5f)

### Test Environment
- Binary under test: /tmp/aloop-test-install-e1QwAP/bin/aloop (version 1.0.0)
- Dashboard dir: aloop/cli/dashboard (CWD)
- Features tested: 5

### Results
- PASS: logHelpers.ts branch coverage 100% (re-verified — bug fixed ✅)
- PASS: sessionHelpers.ts branch coverage 90% (re-verified — bug fixed ✅)
- FAIL: useSSEConnection.ts branch coverage 80.76% (still below ≥90%; bug still open, re-test note added to TODO.md)
- PASS: providerHealth anti-pattern fix (all 3 tests use toEqual with specific shapes ✅)
- PASS: 569 unit tests pass (44 test files, up from 518 last session)
- MARGINAL: useDashboardState.ts 226 LOC (above 200 limit, below 300 code-smell threshold)
- FAIL: Header.tsx 280 LOC (violates <200 rule — already tracked in TODO.md Up Next)
- FAIL: Sidebar.tsx 255 LOC (violates <200 rule — already tracked in TODO.md Up Next)

### Bugs Filed
None new — useSSEConnection.ts coverage bug already tracked as `[ ] [qa/P1]` in TODO.md. Added re-test note: "still 80.76% at iter 7."

### Command Transcript

```
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
/tmp/aloop-test-install-e1QwAP/bin/aloop
Exit code: 0

$ /tmp/aloop-test-install-e1QwAP/bin/aloop --version
1.0.0
Exit code: 0

$ npm run test:coverage (key files)
  logHelpers.ts:         100%   branch (PASS ≥90%)
  sessionHelpers.ts:      90%   branch (PASS ≥90%)
  useSSEConnection.ts:  80.76%  branch (FAIL — 5 uncovered branches, lines 46,57-70,90)
  useDashboardState.ts: 95.68%  branch (PASS ≥90%)
Exit code: 0

$ npm test -- --reporter=verbose
569 tests passed, 0 failures, 44 test files
Duration: 4.19s
Exit code: 0

$ wc -l src/hooks/useDashboardState.ts src/hooks/useSSEConnection.ts src/components/layout/Header.tsx src/components/layout/Sidebar.tsx
 226 useDashboardState.ts  (above 200 SPEC limit — marginal)
 109 useSSEConnection.ts   (PASS <200)
 280 Header.tsx            (FAIL — violates <200, tracked TODO.md Up Next)
 255 Sidebar.tsx           (FAIL — violates <200, tracked TODO.md Up Next)
Exit code: 0

$ grep -n "providerHealth.*toEqual\|toBeDefined" src/hooks/useDashboardState.test.ts
321: expect(result.current.providerHealth).toEqual([]);
330: expect(result.current.providerHealth).toEqual([...specific shapes...]);
342: expect(result.current.providerHealth).toEqual([...specific shapes...]);
(All 3 tests use toEqual — anti-pattern FIXED)
Exit code: 0

$ rm -rf /tmp/aloop-test-install-e1QwAP  # cleanup
Exit code: 0
```

## QA Session — 2026-03-31 (iteration 8)

### Test Environment
- Dashboard dir: aloop/cli/dashboard
- Commit under test: 911184c87
- Test runner: vitest (npm test)
- Features tested: 4

### Results
- PASS: useSSEConnection.ts branch coverage ≥90%
- PASS: useSSEConnection.test.ts state assertion anti-pattern fix
- PASS: Full test suite regression check (569 tests, 44 files)
- FAIL: Header.tsx LOC <200 (still 280 — Up Next, not yet implemented)
- FAIL: Sidebar.tsx LOC <200 (still 255 — Up Next, not yet implemented)

### Bugs Filed
- None new. Header.tsx/Sidebar.tsx LOC failures previously tracked in TODO.md Up Next.

### Command Transcript

```
$ npm test -- --reporter=verbose
Test Files: 44 passed (44)
Tests: 569 passed (569)
Duration: 3.98s
Exit code: 0

$ npm test -- --coverage
src/hooks coverage:
  useSSEConnection.ts | 98.82% Stmts | 90% Branch | 91.66% Funcs | 100% Lines | uncovered: 46,89
  useDashboardState.ts | 98.41% Stmts | 95.68% Branch | 100% Funcs | 100% Lines
  logHelpers.ts | 100% all
  sessionHelpers.ts | 100% Stmts | 90% Branch | 100% Funcs | 100% Lines
Exit code: 0

$ grep -n "not.toBeNull\|toEqual" src/hooks/useSSEConnection.test.ts
93: expect(result.current.loadError).not.toBeNull();  (error existence check — acceptable)
111: expect(result.current.state).toEqual({ log: 'line1', activeSessions: [], recentSessions: [] });  (FIXED — exact shape)
Exit code: 0

$ wc -l src/components/layout/Header.tsx src/components/layout/Sidebar.tsx
280 Header.tsx  (FAIL — violates <200 SPEC rule, Up Next)
255 Sidebar.tsx (FAIL — violates <200 SPEC rule, Up Next)
```
