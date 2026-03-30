# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Current Phase: Dashboard component extraction + test quality fixes

### In Progress

### Up Next

- [x] [review] Fix 3 broken test assertions in MainPanel.test.tsx and DocsPanel.test.tsx (priority: critical)
  - `MainPanel.test.tsx:79` — "calls setActivityCollapsed when collapse button clicked": mock created but collapse button never clicked and mock never asserted; fix: click the collapse button via `getByLabelText` and assert `toHaveBeenCalledWith(true)`
  - `DocsPanel.test.tsx:47` — "switches tab when tab trigger is clicked": asserts `toHaveLength(4)` before AND after the click — proves nothing; fix: assert `data-state="active"` on the clicked tab after click
  - `DocsPanel.test.tsx:63` — "switches to health tab": `fireEvent.click` inside `waitFor` with no post-click assertion; fix: add `expect(screen.getByRole('tab', { name: /Health/i })).toHaveAttribute('data-state', 'active')` after the click

- [ ] [qa/P1] Fix DocsPanel.tsx branch coverage (currently 85.71%, need ≥90%)
  - Uncovered: `useEffect` reset path at line 37 (`setActiveTab(defaultTab)` when `activeTab` becomes invalid)
  - Fix: add a test that renders with `docs` prop containing only one doc, then triggers a state where `activeTab` is no longer in the valid list (e.g., by re-rendering with fewer docs)

- [ ] [qa/P1] Fix Sidebar.tsx branch coverage (currently 78.46%, need ≥90%)
  - Uncovered branches at lines 83,100,159,215 — primarily context menu and olderOpen collapse
  - Add context menu tests: (a) right-click renders menu with `role="menu"` at correct position, (b) "Stop after iteration" calls `onStopSession(id, false)` and closes menu, (c) "Kill immediately" calls `onStopSession(id, true)` and closes menu, (d) "Copy session ID" calls `onCopySessionId(id)` and closes menu, (e) Escape key fires `setContextMenuSessionId(null)`.

- [ ] Extract Header component from AppView.tsx (priority: critical)
  - `Header` (lines 233–362, ~130 LOC): session header with phase badge, iteration counter, elapsed timer, stop/resume buttons, steer input
  - Create `src/components/layout/Header.tsx`, `Header.test.tsx`, `Header.stories.tsx`
  - AppView.tsx still at 823 LOC; spec requires <100 LOC shell

- [ ] Extract QACoverageBadge from AppView.tsx (priority: high)
  - `QACoverageBadge` (lines 363–452, ~90 LOC): QA coverage display badge with fetch logic
  - Create `src/components/progress/QACoverageBadge.tsx`, `.test.tsx`, `.stories.tsx`

- [ ] Extract CommandPalette from AppView.tsx (priority: high)
  - `CommandPalette` (lines 453–492, ~40 LOC): Ctrl+K search overlay
  - Create `src/components/shared/CommandPalette.tsx`, `.test.tsx`, `.stories.tsx`

- [ ] Break up AppInner and reduce AppView.tsx to <100 LOC (priority: high)
  - `AppInner` (lines 493–814, ~322 LOC) contains the main SSE/state/layout orchestration
  - Extract hooks (useSSE / useDashboardState) and remaining sub-components
  - AppView.tsx becomes a thin shell re-exporting everything; then remove the re-exports

- [ ] Split Sidebar.tsx from 255 LOC to ≤200 LOC (priority: medium)
  - Extract context menu + cost-fetch logic into a hook or sub-component
  - Update tests to maintain coverage

- [ ] [spec-gap/P2] Add .test.tsx for untested components: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `SideBySideView.tsx` — each must cover key props, states, and interactions. (priority: medium)

- [ ] [spec-gap/P2] Add .stories.tsx for components missing stories: `ActivityPanel.tsx`, `ArtifactComparisonDialog.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `ImageLightbox.tsx`, `LogEntryExpandedDetails.tsx`, `LogEntryRow.tsx`, `ResponsiveLayout.tsx`, `SideBySideView.tsx`, `SliderView.tsx`. (priority: medium)

### Completed

- [x] Configure Storybook 10 with `@storybook/react-vite` in `.storybook/main.ts`
- [x] Add `npm run storybook` and `build-storybook` scripts to package.json
- [x] Add global decorators in `.storybook/preview.ts` (withThemeByClassName light/dark toggle, TooltipProvider, imports index.css)
- [x] Stories colocated for core components: SessionCard, ProviderHealth, SteerInput, ActivityLog, and UI primitives
- [x] Extract Sidebar.tsx from AppView.tsx (batch 1)
- [x] Extract SessionDetail.tsx thin re-export (batch 1)
- [x] Extract DocsPanel.tsx from SessionDetail.tsx (batch 2)
- [x] Extract MainPanel.tsx (batch 2)
- [x] Add DocsPanel.stories.tsx (6 stories) and MainPanel.stories.tsx (6 stories)
- [x] [review] Gate 6: Capture Playwright screenshots for all story variants and commit to `proof-artifacts/`
  - 6 Sidebar stories (Default, WithSelectedSession, WithOlderSessions, Collapsed, Desktop, Empty)
  - 5 SessionDetail stories (Default, WithProviderHealth, ActivityPanelActive, ActivityCollapsed, WithRepoLink)
  - 6 DocsPanel stories + 6 MainPanel stories (added batch 2)
