# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Gap Analysis

Current state (verified 2026-04-14):
- `AppView.tsx`: 1393 lines → must become <100 LOC
- `Header.tsx`: 168 lines ✓ (split complete)
- `StatusIndicators.tsx`: 98 lines ✓ (extracted, but missing branch coverage tests)
- `QACoverageBadge.tsx`: 142 lines ✓ (extracted, but missing branch coverage tests)
- `DocsPanel.tsx`: 199 lines → already ≤200 LOC ✓
- `Footer.tsx`: 66 lines → already ≤200 LOC ✓
- `AppShell.tsx`: does not exist → must be created
- `MainPanel.tsx`: does not exist → must be created
- Custom hooks `useSSE`, `useSession`, `useSteering`: do not exist → must be created
- `Sidebar.tsx`: does not exist (still in AppView.tsx lines 66–368, ~306 LOC)
- `ActivityPanel.tsx`: does not exist (still in AppView.tsx lines 373–728, ~97 LOC)
- `LogEntryRow.tsx` + `ImageLightbox`: does not exist (still in AppView.tsx lines 470+, ~278 LOC)
- `ArtifactComparison.tsx`: does not exist (still in AppView.tsx lines 748+, ~211 LOC)
- `CommandPalette.tsx`: does not exist (still in AppView.tsx lines 966+, ~36 LOC)

## Tasks

### In Progress

### Up Next

- [x] [review] Add branch coverage tests for `StatusIndicators.tsx` — add `StatusIndicators.test.tsx` covering: (1) `PhaseBadge` with null/empty phase (null return path), (2) `PhaseBadge` with unknown phase (fallback color), (3) `formatSecs` with `m > 0, s === 0` (formats as `"Nm"`). Import components directly from `src/components/layout/StatusIndicators.tsx`.

- [ ] [review] Gate 3: `StatusIndicators.test.tsx` added tests only for `PhaseBadge` and `ElapsedTimer` — `StatusDot` and `ConnectionIndicator` have zero test coverage. New-module ≥90% branch coverage not met. Add tests for: (1) `StatusDot` with `status='running'` — animated pulse dot (assert two nested `<span>` elements with `animate-pulse-dot`); (2) `StatusDot` with `status='stopped'` — static dot (assert single `<span>` with `bg-muted-foreground/50`); (3) `StatusDot` with unknown status (e.g. `status='idle'`) — falls back to `STATUS_DOT_CONFIG.unknown` (`bg-muted-foreground/30`); (4) `ConnectionIndicator` with `status='connected'` — renders Zap icon, text `'Live'`; (5) `ConnectionIndicator` with `status='connecting'` — renders Loader2 icon with `animate-spin`, text `'Connecting...'`; (6) `ConnectionIndicator` with `status='disconnected'` — renders AlertTriangle icon, text `'Disconnected'`. Import from `src/components/layout/StatusIndicators.tsx`. (priority: high)

- [ ] [review] Add branch coverage tests for `QACoverageBadge.tsx` — add `QACoverageBadge.test.tsx` covering: (1) green tone (`coverage_percent >= 80`), (2) red tone (`coverage_percent < 50`), (3) null/N/A state (`available: false`), (4) `parseQACoveragePayload` with non-record input, (5) `percentValue` from `payload.percentage` fallback. Import from `src/components/layout/QACoverageBadge.tsx`.

- [ ] Extract `LogEntryRow` + `ImageLightbox` from AppView.tsx to `src/components/activity/LogEntryRow.tsx` (~250 LOC); update AppView.tsx to import from new location; add re-export in AppView.tsx

- [ ] Extract `ArtifactComparisonDialog` from AppView.tsx to `src/components/activity/ArtifactComparison.tsx` (~160 LOC); update AppView.tsx to import from new location; add re-export

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

### Deferred

- [ ] [review] Gate 7: Browser verification — `Dashboard renders identically before and after refactor`. Playwright blocked by missing `libatk-1.0.so.0` in container. Options: install libatk (`apt-get install -y libatk1.0-0 libatk-bridge2.0-0`), use system Chrome, or document a reproducible manual verification step. Defer until after main refactor is complete.

### Completed

- [x] Split `Header.tsx` (385 LOC → 168 LOC): extracted `PhaseBadge`, `StatusDot`, `ConnectionIndicator`, `ElapsedTimer` to `src/components/layout/StatusIndicators.tsx` (98 LOC), and `QACoverageBadge` with its types/helpers to `src/components/layout/QACoverageBadge.tsx` (142 LOC); Header.tsx imports from both; re-exports provided for backward compat

### QA Bugs

- [ ] [qa/P1] npm test exits with code 1 — 33 pre-existing failures: `dashboard.test.ts` (GH path hardening: "gh: blocked by aloop PATH hardening"), `orchestrate.test.ts` (ReferenceError: state is not defined in launchChildLoop/dispatchChildLoops/runOrchestratorScanPass/processQueuedPrompts), `process-requests.test.ts`, `github-monitor.test.ts` (EtagCache). Test files unchanged since commit 6a72a5f9 but previous QA reported "250/250 passing" — prior QA may have only counted aloop.test.mjs (250 tests) while tsx tests were silently excluded. Full suite now: 1077 pass, 33 fail out of 1111 total. Tested at iter 46. (priority: high)

- [ ] [qa/P1] npm run type-check fails with 16 TypeScript errors: `aloop/cli npm run type-check` (runs `tsc --noEmit` against `src/**/*`) reports errors in `src/commands/orchestrate.ts` (Cannot find name 'state', 'provider', 'roundRobinOrder'; Property 'round_robin_order' does not exist on OrchestratorState — 8 errors), `src/commands/process-requests.ts` (Cannot find name 'sweepStaleRunningIssueStatuses'; unintentional comparison — 2 errors), `src/commands/process-requests.test.ts` (missing exports: formatReviewCommentHistory, getDirectorySizeBytes, pruneLargeV8CacheDir, syncMasterToTrunk, syncChildBranches, ChildBranchSyncDeps — 6 errors). These files were last changed at commit eeba1148, well before the Header.tsx refactor; the prior QA_COVERAGE.md PASS entry at 9899c43a was incorrect. Tested at iter 48. (priority: high)
