# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Gap Analysis

Current state:
- `AppView.tsx`: 1393 lines → must become <100 LOC
- `Header.tsx`: 385 lines → must become ≤200 LOC (acceptance criterion)
- `DocsPanel.tsx`: 199 lines → already ≤200 LOC ✓
- `Footer.tsx`: 66 lines → already ≤200 LOC ✓
- `AppShell.tsx`: does not exist → must be created
- `MainPanel.tsx`: does not exist → must be created
- Custom hooks `useSSE`, `useSession`, `useSteering`: do not exist → must be created
- `Sidebar` component (AppView.tsx lines 66–368): needs its own file `Sidebar.tsx`
- `ActivityPanel` + `LogEntryRow` (AppView.tsx lines 373–728): need their own files
- `ArtifactComparisonDialog` + `ImageLightbox` (AppView.tsx lines 730–960): need their own files
- `CommandPalette` (AppView.tsx lines 966–1002): needs its own file

## Tasks

### In Progress

### Up Next

- [x] Split `Header.tsx` (385 LOC → ≤200): extract `PhaseBadge`, `StatusDot`, `ConnectionIndicator`, `ElapsedTimer` to `src/components/layout/StatusIndicators.tsx` (~80 LOC), and `QACoverageBadge` with its types/helpers to `src/components/layout/QACoverageBadge.tsx` (~115 LOC); update Header.tsx to import from them; re-export from Header.tsx for backward compat

- [ ] Extract `LogEntryRow` + `ImageLightbox` from AppView.tsx to `src/components/activity/LogEntryRow.tsx` (~250 LOC); update AppView.tsx to import from new location; add re-export in AppView.tsx

- [ ] Extract `ArtifactComparisonDialog` from AppView.tsx to `src/components/activity/ArtifactComparison.tsx` (~160 LOC); update AppView.tsx to import from new location; add re-export in AppView.tsx

- [ ] Extract `ActivityPanel` from AppView.tsx to `src/components/activity/ActivityPanel.tsx` (~100 LOC, depends on LogEntryRow.tsx); update AppView.tsx import; add re-export

- [ ] Extract `Sidebar` component from AppView.tsx to `src/components/layout/Sidebar.tsx` (~300 LOC → may need `SessionCard.tsx` sub-split if >200); update AppView.tsx import; add re-export

- [ ] Extract `CommandPalette` from AppView.tsx to `src/components/layout/CommandPalette.tsx` (~35 LOC); update AppView.tsx import

- [ ] Create `src/hooks/useSSE.ts`: extract SSE connection logic from `AppInner` (~80 LOC) — manages EventSource, reconnect, `connectionStatus`, `state` and `qaCoverageRefreshKey`

- [ ] Create `src/hooks/useSession.ts`: extract session selection/URL-sync logic from `AppInner` (~50 LOC) — manages `selectedSessionId`, `selectSession`, session list derivation

- [ ] Create `src/hooks/useSteering.ts`: extract steering/stop/resume API calls from `AppInner` (~80 LOC) — manages `handleSteer`, `handleStop`, `handleResume` and their submitting states

- [ ] Create `src/components/layout/AppShell.tsx` (<150 LOC): three-panel layout using `ResizablePanelGroup`/`ResizablePanel` from `@/components/ui/resizable`; accepts `sidebar`, `main`, `docs` render props; handles responsive breakpoints (mobile: stacked/tabs, tablet: 2-panel, desktop: 3-panel with resizable)

- [ ] Create `src/components/layout/MainPanel.tsx` (<150 LOC): composes `Header` + mobile panel toggle tabs + activity/docs panels + `Footer`; accepts all needed props from hooks; no state of its own

- [ ] Reduce `AppView.tsx` to <100 LOC: keep only (a) re-exports for backward compat (Sidebar, ActivityPanel, LogEntryRow, ArtifactComparisonDialog, lib utilities), (b) keyboard/touch shortcut handling, (c) `App` function that calls `useSSE`/`useSession`/`useSteering`/`useCost`, derives display values, renders `<AppShell>` with panels; verify all existing exports in `App.tsx` still resolve

- [ ] Add tests for `Sidebar.tsx`: render with sessions, collapsed state, context menu, cost display

- [ ] Add tests for `AppShell.tsx`: three-panel render, responsive visibility, panel prop passing

- [ ] Verify `npm run type-check` passes with zero errors after full refactor

### Completed

### Review Findings

- [ ] [review] Gate 3: `StatusIndicators.tsx` missing branch coverage — add unit tests for: (1) `PhaseBadge` with empty phase (null return), (2) `PhaseBadge` with unknown phase (fallback color), (3) `formatSecs` with `m > 0, s === 0` (formats as `"Nm"`). Import and test components directly in `StatusIndicators.test.tsx`.

- [ ] [review] Gate 3: `QACoverageBadge.tsx` missing branch coverage — add tests for: (1) green tone (`coverage_percent >= 80`), (2) red tone (`coverage_percent < 50`), (3) null/N/A state (`available: false`), (4) `parseQACoveragePayload` with non-record input, (5) `percentValue` from `payload.percentage` fallback. Extend `App.coverage.integration-qa.test.ts` or add `QACoverageBadge.test.tsx`.

- [ ] [review] Gate 7: Browser verification required — `Dashboard renders identically before and after refactor`. Playwright blocked by missing `libatk-1.0.so.0` in container. Need alternative: install libatk (`apt-get install -y libatk1.0-0 libatk-bridge2.0-0`), or use `--browser=chromium` with system Chrome, or document a reproducible manual verification step with a screenshot.

### QA Bugs

- [ ] [qa/P1] npm test exits with code 1 — 33 pre-existing failures: `dashboard.test.ts` (GH path hardening: "gh: blocked by aloop PATH hardening"), `orchestrate.test.ts` (ReferenceError: state is not defined in launchChildLoop/dispatchChildLoops/runOrchestratorScanPass/processQueuedPrompts), `process-requests.test.ts`, `github-monitor.test.ts` (EtagCache). Test files unchanged since commit 6a72a5f9 but previous QA reported "250/250 passing" — prior QA may have only counted aloop.test.mjs (250 tests) while tsx tests were silently excluded. Full suite now: 1077 pass, 33 fail out of 1111 total. Tested at iter 46. (priority: high)
