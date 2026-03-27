# QA Log

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
