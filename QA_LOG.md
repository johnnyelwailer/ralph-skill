# QA Log

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
