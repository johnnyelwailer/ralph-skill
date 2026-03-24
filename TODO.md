# Project TODO

## Current Phase: Dashboard Component Architecture Refactor (Issue #183)

Goal: Decompose `AppView.tsx` (2160 lines) into focused components (~150 LOC each), each with tests and Storybook stories. Reduce `AppView.tsx` to <100 LOC layout shell.

Migration order per spec: utilities → leaf components → composite components → layout → slim AppView.

---

### In Progress

- [x] [review] Gate 6: PhaseBadge proof captured — 6 PNG screenshots appended to `proof-manifest.json` (entries 12–17) via HTTP+Playwright. (priority: high)

- [ ] [review] Gate 2: `StatusDot.test.tsx` lines 11-67 never verify tooltip label content — the `STATUS_DOT_CONFIG` label values ("Running", "Stopped", "Exited", etc.) are completely unverified. Rewrite StatusDot tests to assert tooltip labels via `screen.getByText('Running')` etc. (mirroring the pattern already in ConnectionIndicator tests at lines 88-101). Also remove duplicate test: "renders dot element for running status" (lines 11-13) and "renders pulse animation for running status" (lines 22-26) both assert `container.querySelector('.animate-pulse-dot').toBeTruthy()` with no distinction — delete one. (priority: high)

- [ ] [review] Gate 6: `StatusDot.stories.tsx` exports 7 stories but proof manifest (entries 18-23) only captures 3 StatusDot variants (Running, Stopped, Error). Missing proof screenshots for: Exited (`.bg-muted-foreground/50`), Unhealthy (`.bg-red-500`), Stuck (`.bg-orange-500` — unique color not yet proven), Unknown (`.bg-muted-foreground/30`). Capture the 4 missing story screenshots via HTTP+Playwright and append to `proof-manifest.json`. (priority: high)

### Up Next

- [x] Extract `lib/types.ts` — move shared TypeScript interfaces (`SessionSummary`, `LogEntry`, `IterationUsage`, `DashboardState`, `ArtifactEntry`, `ArtifactManifest`, `ManifestPayload`, `ConnectionStatus`, `AnsiStyle`, `QACoverageViewData`) from `AppView.tsx` into `lib/types.ts`; update all imports (priority: high, foundational — blocks all component extractions)

- [x] Extract `shared/ElapsedTimer.tsx` with test and stories — move `ElapsedTimer` component (AppView.tsx:246) into `components/shared/ElapsedTimer.tsx`; add `ElapsedTimer.test.tsx` and `ElapsedTimer.stories.tsx` (priority: high, leaf component)
- [x] [review] Gate 6: ElapsedTimer proof captured — 3 PNG screenshots appended to `proof-manifest.json` (entries 9–11) via HTTP+Playwright. (priority: high)

- [x] Extract `shared/PhaseBadge.tsx` with test and stories — move `PhaseBadge` (AppView.tsx:189) into `components/shared/PhaseBadge.tsx`; add test and stories (priority: high, leaf component)

- [x] Extract `shared/StatusDot.tsx` with test and stories — move `StatusDot` (AppView.tsx:206) and `ConnectionIndicator` (AppView.tsx:227) into `components/shared/StatusDot.tsx`; add test and stories (priority: high, leaf component)
- [x] [review] Gate 6: StatusDot proof captured — 6 PNG screenshots appended to `proof-manifest.json` (entries 18–23) via HTTP+Playwright. (priority: high)

- [ ] [qa/P2] ConnectionIndicator stories mis-grouped under StatusDot in Storybook: `StatusDot.stories.tsx` has a second meta (`connectionMeta` with `title: 'Shared/ConnectionIndicator'`) but no second `export default`, so all 10 stories register as `shared-statusdot--*`. ConnectionIndicator stories (Connected, Connecting, Disconnected) should appear under `shared-connectionindicator--*`. Fix: create a separate `ConnectionIndicator.stories.tsx` with its own default export. Tested at iter 9. (priority: medium)

- [ ] Extract `shared/AnsiRenderer.tsx` with test and stories — create `components/shared/AnsiRenderer.tsx` wrapping `renderAnsiToHtml` from `lib/ansi.ts`; add test and stories (priority: medium, leaf component — requires lib/ansi.ts)

- [ ] Extract `activity/LogEntry.tsx` with test and stories — move `LogEntryRow` component (AppView.tsx:1204) into `components/activity/LogEntry.tsx`; add test and stories (priority: medium, leaf component)

- [ ] Extract `activity/ActivityLog.tsx` with test and stories — move `ActivityPanel` (AppView.tsx:1107) into `components/activity/ActivityLog.tsx`; depends on `LogEntry.tsx` (priority: medium, composite)

- [ ] Extract `session/SessionCard.tsx` with test and stories — extract single-session card UI from `Sidebar` (AppView.tsx:430) into `components/session/SessionCard.tsx`; add test and stories (priority: medium, leaf component)

- [ ] Extract `session/SessionList.tsx` with test and stories — extract grouped session list from `Sidebar` into `components/session/SessionList.tsx`; depends on SessionCard (priority: medium, composite)

- [ ] Extract `steering/SteerInput.tsx` with test and stories — extract steering textarea + send button from `App` into `components/steering/SteerInput.tsx`; add test and stories (priority: medium, leaf)

- [ ] Extract `shared/CommandPalette.tsx` with test and stories — move `CommandPalette` (AppView.tsx:1769) into `components/shared/CommandPalette.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Sidebar.tsx` with test and stories — move `Sidebar` function (AppView.tsx:430) into `components/layout/Sidebar.tsx` using extracted `SessionList`/`SessionCard`; add test and stories (priority: medium, composite layout)

- [ ] Extract `layout/DocsPanel.tsx` with test and stories — move `DocsPanel` (AppView.tsx:953) into `components/layout/DocsPanel.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Header.tsx` with test and stories — move `Header` component (AppView.tsx:733) into `components/layout/Header.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Footer.tsx` with test and stories — move `Footer` (AppView.tsx:1706) into `components/layout/Footer.tsx`; add test and stories (priority: medium)

- [ ] Extract `hooks/useSSE.ts` with test — extract SSE connection logic from `App.useEffect` (AppView.tsx:1809) into `hooks/useSSE.ts`; add `useSSE.test.ts` (priority: medium, enables slim App)

- [ ] Extract `hooks/useSession.ts` with test — extract session selection/URL sync logic from `App` into `hooks/useSession.ts`; add `useSession.test.ts` (priority: medium, enables slim App)

- [ ] Slim `AppView.tsx` to <100 LOC — after all components and hooks extracted, `App()` becomes a thin shell importing layout components; verify all tests pass and dashboard renders correctly (priority: low, final step)

---

### Deferred

- [ ] Extract `layout/MainPanel.tsx` — central content area layout wrapper; defer until Sidebar/DocsPanel/ActivityLog extracted (priority: low)

- [ ] Extract `layout/AppShell.tsx` — top-level layout composition; defer until all sub-panels extracted (priority: low)

- [ ] Extract `steering/SteerHistory.tsx` — previous steering messages display; defer, low complexity (priority: low)

- [ ] Extract `progress/IterationProgress.tsx` with test and stories — extract progress bar component; defer until usage is clear (priority: low)

- [ ] Extract `progress/CycleIndicator.tsx` with test and stories — defer (priority: low)

- [ ] Extract `hooks/useSteering.ts` with test — extract steering submission logic; defer until SteerInput extracted (priority: low)

- [ ] Extract `hooks/useTheme.ts` with test — dark/light mode hook; defer, currently handled via CSS class (priority: low)

- [ ] Playwright visual regression test — screenshot comparison before/after refactor; defer until AppView is slimmed (priority: low)

---

### Completed

- [x] Configure Storybook 10.x with `@storybook/react-vite` in `aloop/dashboard/.storybook/` — `main.ts` and `preview.ts` configured with dark mode decorator and TooltipProvider wrapper
- [x] Extract `components/health/ProviderHealth.tsx` with tests (`ProviderHealth.test.tsx`) and stories (`ProviderHealth.stories.tsx`)
- [x] Extract `components/progress/CostDisplay.tsx` with tests (`CostDisplay.test.tsx`) and stories (`CostDisplay.stories.tsx`)
- [x] Extract `components/artifacts/ArtifactViewer.tsx` with tests (`ArtifactViewer.test.tsx`)
- [x] Add `ArtifactViewer.stories.tsx` — all components in `components/` require a `.stories.tsx` file per spec
- [x] Add hooks: `useCost.ts`, `useIsTouchDevice.ts`, `useLongPress.ts` with tests
- [x] Add UI component stories (button, card, collapsible, command, dropdown-menu, hover-card, progress, resizable, scroll-area, sonner, tabs, textarea, tooltip)
- [x] [review] Gate 6 / [qa/P1] Proof screenshots fixed — replaced file:// screenshots with valid HTTP-served Playwright captures; proof-manifest.json written to session artifacts dir
- [x] [review] Gate 4: REVIEW_LOG.md restored with b0cf335a PASS entry prepended
- [x] [review] Gate 8: VERSIONS.md updated to `@storybook/* | 10.x` to match package.json
- [x] [review] Gate 9: SPEC-ADDENDUM.md updated to reference Storybook 10.x
- [x] Extract `lib/ansi.ts` — moved `stripAnsi`, `PALETTE_256`, `rgbStr`, `parseAnsiSegments`, `renderAnsiToHtml` out of `AppView.tsx` into `lib/ansi.ts`; unit tests in `lib/ansi.test.ts`
- [x] [review] Gate 2: `lib/ansi.test.ts` already uses exact `.toBe()` string assertions for all ANSI color RGB values
- [x] Extract `lib/format.ts` — moved `formatTime`, `formatTimeShort`, `formatSecs`, `formatDuration`, `formatDateKey`, `relativeTime`, `formatTokenCount`, `parseDurationSeconds` from `AppView.tsx` into `lib/format.ts`; updated imports in `formatHelpers.test.tsx`; re-exports from `AppView.tsx` for backward compatibility
- [x] [review] Gate 3: `lib/format.ts` has no dedicated test file — created `lib/format.test.ts` covering all 8 exported functions
- [x] [review] Gate 2: Strengthened `lib/format.test.ts` assertions — `formatTime`/`formatTimeShort` use `toMatch(/\d{1,2}:\d{2}/)`, `formatSecs(-5)` uses `toBe('-1m')`, all functions have exact-value assertions and edge cases (empty string, zero, negative, invalid input)
