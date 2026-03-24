# Project TODO

## Current Phase: Dashboard Component Architecture Refactor (Issue #183)

Goal: Decompose `AppView.tsx` (2445 lines) into focused components (~150 LOC each), each with tests and Storybook stories. Reduce `AppView.tsx` to <100 LOC layout shell.

Migration order per spec: utilities → leaf components → composite components → layout → slim AppView.

---

### In Progress

- [ ] [review] Gate 6: No visual proof for this build cycle — build added ProviderHealth component and Storybook stories for ArtifactViewer/ProviderHealth/CostDisplay (all observable visual output); proof agent must run `npx storybook build`, capture screenshots of at least the new stories (ProviderHealth/AllHealthy, Mixed, AllFailed; CostDisplay/NoBudgetCap, WithBudgetWarning, WithBudgetCritical; ArtifactViewer/SingleImage, WithDiffBadgeCritical), and write a proof-manifest.json to the session artifacts dir (priority: high)
- [ ] [qa/P1] Proof screenshots are invalid "Not found" pages: proof-artifacts/ contains 8 story screenshots that are all identical (MD5: 99b13def98aa849306b4f00e23948c59, size 5199 bytes each), all showing only "Not found" text on a white background. Proof agent navigated to story URLs using file:// protocol which returns 404 — must serve the Storybook static build via HTTP server (`python3 -m http.server <port>` or `npx serve`) before capturing screenshots with Playwright. Tested at iter 2. (priority: high)
- [ ] [review] Gate 4: REVIEW_LOG.md was deleted in commit 44db1b40 (save-wip) and has never been restored — recreate it with the correct review history (at minimum: the PASS at b0cf335a and the FAIL at 2fbd29ee with its 3 findings) and append to it going forward; the log is append-only per review protocol (priority: high)
- [x] [review] Gate 8: VERSIONS.md declares `@storybook/* | 8.x` (line 71) but package.json has all `@storybook/*` packages at `^10.3.1` — major version mismatch must be corrected; update VERSIONS.md to `@storybook/* | 10.x` (priority: high)
- [x] [review] Gate 9: SPEC-ADDENDUM.md line 139 says "Storybook 8" and acceptance criteria line 176 says "Storybook 8 is configured" — both are outdated; update SPEC-ADDENDUM.md to reference Storybook 10.x (priority: medium)

### Up Next

- [ ] Extract `lib/ansi.ts` — move `stripAnsi`, `PALETTE_256`, `rgbStr`, `parseAnsiSegments`, `renderAnsiToHtml` out of `AppView.tsx` into `lib/ansi.ts`; update all imports; add unit tests in `lib/ansi.test.ts` (priority: high, foundational — blocks AnsiRenderer)

- [ ] Extract `lib/format.ts` — move `formatTime`, `formatTimeShort`, `formatSecs`, `formatDuration`, `formatDateKey`, `relativeTime`, `formatTokenCount`, `parseDurationSeconds`, `computeAvgDuration` from `AppView.tsx` into `lib/format.ts`; update imports; existing `formatHelpers.test.tsx` should import from new location (priority: high, foundational)

- [ ] Extract `lib/types.ts` — move shared TypeScript interfaces (`SessionSummary`, `LogEntry`, `IterationUsage`, `DashboardState`, `ArtifactEntry`, `ArtifactManifest`, `ManifestPayload`, `ConnectionStatus`, `AnsiStyle`, `QACoverageViewData`) from `AppView.tsx` into `lib/types.ts`; update all imports (priority: high, foundational — blocks all component extractions)

- [ ] Extract `shared/ElapsedTimer.tsx` with test and stories — move `ElapsedTimer` component (AppView.tsx:491) into `components/shared/ElapsedTimer.tsx`; add `ElapsedTimer.test.tsx` and `ElapsedTimer.stories.tsx` (priority: high, leaf component)

- [ ] Extract `shared/PhaseBadge.tsx` with test and stories — move `PhaseBadge` (AppView.tsx:432) into `components/shared/PhaseBadge.tsx`; add test and stories (priority: high, leaf component)

- [ ] Extract `shared/StatusDot.tsx` with test and stories — move `StatusDot` (AppView.tsx:449) and `ConnectionIndicator` (AppView.tsx:472) into `components/shared/StatusDot.tsx`; add test and stories (priority: high, leaf component)

- [ ] Extract `shared/AnsiRenderer.tsx` with test and stories — create `components/shared/AnsiRenderer.tsx` wrapping `renderAnsiToHtml` from `lib/ansi.ts`; add test and stories (priority: medium, leaf component — requires lib/ansi.ts)

- [ ] Extract `activity/LogEntry.tsx` with test and stories — move `LogEntryRow` component (AppView.tsx:1489) into `components/activity/LogEntry.tsx`; add test and stories (priority: medium, leaf component)

- [ ] Extract `activity/ActivityLog.tsx` with test and stories — move `ActivityPanel` (AppView.tsx:1392) into `components/activity/ActivityLog.tsx`; depends on `LogEntry.tsx` (priority: medium, composite)

- [ ] Extract `session/SessionCard.tsx` with test and stories — extract single-session card UI from `Sidebar` (AppView.tsx:715) into `components/session/SessionCard.tsx`; add test and stories (priority: medium, leaf component)

- [ ] Extract `session/SessionList.tsx` with test and stories — extract grouped session list from `Sidebar` into `components/session/SessionList.tsx`; depends on SessionCard (priority: medium, composite)

- [ ] Extract `steering/SteerInput.tsx` with test and stories — extract steering textarea + send button from `App` into `components/steering/SteerInput.tsx`; add test and stories (priority: medium, leaf)

- [ ] Extract `shared/CommandPalette.tsx` with test and stories — move `CommandPalette` (AppView.tsx:2054) into `components/shared/CommandPalette.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Sidebar.tsx` with test and stories — move `Sidebar` function (AppView.tsx:715) into `components/layout/Sidebar.tsx` using extracted `SessionList`/`SessionCard`; add test and stories (priority: medium, composite layout)

- [ ] Extract `layout/DocsPanel.tsx` with test and stories — move `DocsPanel` (AppView.tsx:1238) into `components/layout/DocsPanel.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Header.tsx` with test and stories — move `Header` component (AppView.tsx:1018) into `components/layout/Header.tsx`; add test and stories (priority: medium)

- [ ] Extract `layout/Footer.tsx` with test and stories — move `Footer` (AppView.tsx:1991) into `components/layout/Footer.tsx`; add test and stories (priority: medium)

- [ ] Extract `hooks/useSSE.ts` with test — extract SSE connection logic from `App.useEffect` (AppView.tsx:2150) into `hooks/useSSE.ts`; add `useSSE.test.ts` (priority: medium, enables slim App)

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
