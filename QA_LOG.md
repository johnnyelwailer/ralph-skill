# QA Log

## QA Session — 2026-03-27 (iteration 23)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-AQIKs4/bin/aloop` v1.0.0
- Commit under test: abfe37d9b (latest)
- Features tested: 4 (2 new fixes + 2 re-tests + 1 pre-existing failure confirmation)
- Playwright E2E: available (/tmp now 42% full, 7.4GB free)

### Results
- PASS: Desktop Sidebar Collapse button hidden at desktop viewport (`isDesktop={isDesktop}` fix) — proof.spec.ts:149 ✓
- PASS: Swipe-right-to-open sidebar gesture on mobile (`handleTouchStart/handleTouchEnd` fix) — proof.spec.ts:103 ✓
- PASS: All 5 proof.spec.ts tests via Playwright E2E
- PASS: All 148 unit tests
- FAIL: smoke.spec.ts:135 — test expects Activity panel hidden on mobile (now always-visible stacked layout); already tracked in TODO.md
- FAIL: smoke.spec.ts:154 — test looks for removed 'Documents'/'Activity' toggle buttons; already tracked in TODO.md

### Bugs Filed
None — smoke.spec.ts failures already tracked in TODO.md as `[ ] [review] Gate 5` (not new bugs).

### Command Transcript

```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
$ echo "Binary: $ALOOP_BIN"
Binary: /tmp/aloop-test-install-AQIKs4/bin/aloop
$ "$ALOOP_BIN" --version
1.0.0

$ npm --prefix aloop/cli/dashboard test -- --reporter=verbose 2>&1 | tail -5
Test Files  20 passed (20)
Tests       148 passed (148)
Duration    2.74s

$ cd aloop/cli/dashboard
$ npx playwright test e2e/proof.spec.ts --reporter=line
Running 5 tests using 1 worker
  5 passed (5.5s)

$ npx playwright test e2e/smoke.spec.ts --reporter=line
Running 6 tests using 1 worker
  2 failed
    e2e/smoke.spec.ts:135:1 › layout at 375x667 (mobile) shows only one panel and mobile menu
      FAIL: line 146 — Activity heading expected not visible but IS visible (panels now stacked)
      FAIL: line 149 — getByRole('button', { name: 'Activity' }) — button removed
    e2e/smoke.spec.ts:154:1 › layout at 390x844 (mobile) keeps key controls at minimum 44x44 tap size
      FAIL: line 159 — getByRole('button', { name: 'Documents' }) — button removed
  4 passed (20.8s)
```

### Structural Verification

**isDesktop prop on Sidebar** (AppView.tsx:2509):
```
<Sidebar ... isDesktop={isDesktop} />
```

**Collapse button guarded by isDesktop** (AppView.tsx:938):
```
{!isDesktop && (
  <button aria-label="Collapse sidebar" ...>...</button>
)}
```
→ At desktop viewport (isDesktop=true), Collapse button is not rendered ✓

**Touch handlers attached to root div** (AppView.tsx:2505):
```
<div className="h-screen flex flex-col ..." onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
```

**handleTouchEnd calls setMobileMenuOpen** (AppView.tsx:2216-2224):
```
const handleTouchEnd = useCallback((e: React.TouchEvent) => {
  if (!isMobile || touchStartXRef.current === null) return;
  const startX = touchStartXRef.current;
  touchStartXRef.current = null;
  if (startX > SWIPE_EDGE_THRESHOLD_PX) return;
  const endX = e.changedTouches[0]?.clientX ?? 0;
  if (endX - startX >= SWIPE_MIN_DISTANCE_PX) {
    setMobileMenuOpen(true);  ← correct: uses mobileMenuOpen state
  }
}, [isMobile]);
```
→ Mobile drawer renders on `{mobileMenuOpen && ...}` at line 2512 ✓

---

## QA Session — 2026-03-27 (iteration 22)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-Hvb7jH/bin/aloop` v1.0.0
- Session dir used for dashboard: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-113-20260327-114404`
- Commit under test: 9eaac5693
- Features tested: 5 (re-test of 3 previously-FAIL + 2 new)
- Note: /tmp filesystem was 100% full (13GB/13GB) — Playwright browser testing blocked. Fallback to (a) compiled bundle class inspection, (b) source structural inspection, (c) unit test run.

### Results
- PASS: Fixed steer footer on mobile (footer: `fixed bottom-0 inset-x-0 z-30`; main: `pb-[calc(60px+env(safe-area-inset-bottom))]`; structural)
- PASS: Docs panel tabs dropdown on mobile (`sm:hidden` trigger at line 1289; `hidden sm:flex` TabsList at line 1313; structural)
- PASS: Responsive layout panels stack vertically on mobile (`flex-col` default, `sm:flex-row` when sidebar closed; structural)
- PASS: Command palette full-screen on mobile (outer `fixed inset-0`, inner `w-full min-h-full border-0`; structural)
- PASS: sidebarCollapsed ReferenceError fix verified — `collapsed={!sidebarOpen}` at AppView.tsx:2509; all 148 unit tests pass

### Bugs Filed
None — all previously-filed bugs are fixed.

### Command Transcript

```
$ cd /home/pj/.aloop/sessions/.../worktree
$ npm --prefix aloop/cli run test-install -- --keep
✓ test-install passed (prefix kept at /tmp/aloop-test-install-Hvb7jH)
/tmp/aloop-test-install-Hvb7jH/bin/aloop

$ /tmp/aloop-test-install-Hvb7jH/bin/aloop --version
1.0.0

[Playwright blocked: /tmp 100% full — 13GB/13GB]

$ npm --prefix aloop/cli/dashboard test -- --reporter=verbose
Test Files  20 passed (20)
Tests       148 passed (148)
Duration    2.19s
```

### Structural Verification

**Fixed steer footer** (AppView.tsx:2095):
```
<footer className="fixed bottom-0 inset-x-0 z-30 ... pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:relative sm:inset-x-auto sm:bottom-auto sm:z-auto sm:pb-2 ...">
```
Main element (AppView.tsx:2522):
```
<main className="flex-1 min-h-0 p-2 pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-2 md:p-3">
```

**Docs panel mobile dropdown** (AppView.tsx:1289, 1313):
```
<button className="sm:hidden ...">  ← mobile dropdown trigger
<TabsList className="hidden sm:flex ...">  ← desktop tab bar
```

**Responsive panels** (AppView.tsx:2523):
```
<div className={`flex gap-3 h-full flex-col ${!sidebarOpen ? 'sm:flex-row' : ''} lg:flex-row`}>
```

**Command palette full-screen** (AppView.tsx:2154-2155):
```
<div className="fixed inset-0 z-50 flex items-start sm:items-start sm:justify-center sm:pt-[20vh] ...">
  <div className="w-full sm:max-w-md sm:rounded-lg border-0 sm:border ... min-h-full sm:min-h-0">
```

---

## QA Session — 2026-03-27 (iteration 5)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-113-20260327-114404/worktree
- Commit under test: 76c5bac32
- Features tested: 3 (fixed footer, docs tab dropdown, responsive layout)
- Test runner: `npm test` (vitest) in `aloop/cli/dashboard/`

### Results
- PASS: ResponsiveLayout hook unit tests (4/4)
- FAIL: AppInner integration tests (7 failures — all root-caused to same bug)
- FAIL: Fixed steer footer — could not verify due to crash
- FAIL: Docs panel tab dropdown — could not verify due to crash
- FAIL: Responsive layout panels — could not verify due to crash

### Bugs Filed
- [qa/P1] `sidebarCollapsed` ReferenceError crashes AppInner — all integration tests fail

### Command Transcript

```
$ cd aloop/cli/dashboard && npm test

Test Files: 3 failed | 17 passed (20)
Tests:      7 failed | 141 passed (148)
Duration:   2.23s

FAIL src/App.coverage.integration-app.test.ts
FAIL src/App.coverage.integration-qa.test.ts
FAIL src/App.coverage.integration-sidebar.test.ts

ReferenceError: sidebarCollapsed is not defined
  at AppInner (src/AppView.tsx:2509:123)
```

### Root Cause Analysis

The `AppInner` component (AppView.tsx:2188) was refactored to use
`useResponsiveLayout()` which provides `{ sidebarOpen, toggleSidebar,
openSidebar, closeSidebar, ... }`. However, three references to the old
`sidebarCollapsed` local state were left in the JSX:

- Line 2509: `collapsed={sidebarCollapsed}` and `setSidebarCollapsed(!sidebarCollapsed)`
- Line 2521: `onOpenSwitcher={() => setSidebarCollapsed(false)}`
- Line 2523: `${sidebarCollapsed ? 'sm:flex-row' : ''}`

Since `sidebarCollapsed` is never declared in the function scope, React
throws `ReferenceError` on first render, crashing the entire app.

Fix required: replace all occurrences:
- `sidebarCollapsed` → `!sidebarOpen`
- `setSidebarCollapsed(!sidebarCollapsed)` → `toggleSidebar()`
- `setSidebarCollapsed(false)` → `openSidebar()`
