# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Current Phase: Dashboard component extraction + test quality fixes

### In Progress

- [x] [qa/P1] Fix Header.tsx branch coverage (currently 87.61%, now 90.26%, need ≥90%): added tests for 4 uncovered branches — (1) `f.status` non-string → `'UNTESTED'` fallback, (2) `stuckCount > 0` red styling in hover card, (3) `avgDuration && sessionCost > 0` separator in stats span, (4) `updatedAt` empty while not loading → empty string. (priority: high)
- [ ] [qa/P1] Header stories missing from story-screenshots.spec.ts: `Header.stories.tsx` has 7 stories (`Default`, `Loading`, `Disconnected`, `Stopped`, `NoProvider`, `HighBudgetUsage`, `QABadgeDefault`) but `e2e/story-screenshots.spec.ts` only covers 23 stories (Sidebar/SessionDetail/DocsPanel/MainPanel). Add Header story IDs and proof-artifact filenames. (priority: high)
- [ ] [qa/P2] `layout-header--qa-badge-default` story renders "No Preview" in static Storybook build: story appears in index.json (type=story, exportName=QABadgeDefault) but #storybook-root is empty when loaded in iframe. Other 6 Header stories render correctly. Investigate and fix. (priority: medium)

- [x] Extract Header component from AppView.tsx (priority: critical)
  - `Header` (lines 233–362, ~130 LOC): session header with phase badge, iteration counter, elapsed timer, stop/resume buttons, steer input
  - Created `src/components/layout/Header.tsx`, `Header.test.tsx`, `Header.stories.tsx`
  - AppView.tsx reduced from 823 → 554 LOC

- [x] Extract QACoverageBadge from AppView.tsx (priority: high)
  - `QACoverageBadge` (lines 363–452, ~90 LOC): QA coverage display badge with fetch logic
  - Moved into `Header.tsx` (co-located since Header directly uses it); re-exported from AppView.tsx
  - Tests added to `Header.test.tsx`; stories added to `Header.stories.tsx`

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

- [x] [review] Gate 2: `Sidebar.test.tsx` — 4 cost API branch tests assert rendered output via tooltip. (priority: high)
- [x] [review] Gate 2: `Header.test.tsx:94-97` — rewrote `renders connection indicator` to assert ConnectionIndicator component renders by data-testid, not just outer wrapper. (priority: high)
- [x] [review] Gate 2: `Header.test.tsx:135-139` — rewrote elapsed timer test to match formatted time pattern. (priority: high)
- [x] [review] Gate 2: `Header.test.tsx:141-149` — added `$2.5000` cost value assertion in hover card. (priority: high)
- [x] [review] Gate 4: `Header.tsx:14` — deleted dead import `str` from `@/lib/activityLogHelpers`. (priority: medium)
- [x] [review] Gate 4: `Header.test.tsx:8-10` — removed dead `vi.mock('@/hooks/useCost', ...)` mock. (priority: low)
- [x] [review] Gate 3: DocsPanel.tsx branch coverage still 85.71% after test fixes — added test to cover `useEffect` reset branch at line 37 (priority: critical)
- [x] [review] Gate 4: `playwright.stories.config.ts` dead code removed — confirmed clean (priority: low)
- [x] [review] Gate 2: `DocsPanel.test.tsx:145-160` — added post-click assertion `expect(screen.getByRole('tab', { name: 'EXTRA' })).toHaveAttribute('data-state', 'active')` (priority: high)
- [x] [review] Gate 4 (follow-up): `playwright.stories.config.ts:1-2,5` dead imports deleted (priority: low)
- [x] [qa/P1] Fix Sidebar.tsx branch coverage (was 78.46%, now 92.3%, need ≥90%)
  - Added context menu tests, older sessions collapse toggle, cost API response branches, collapsed state tests, selectedSessionId matching, current session click → null branch, suppress-click-after-context-menu
- [x] [review] Fix 3 broken test assertions in MainPanel.test.tsx and DocsPanel.test.tsx (priority: critical)
  - `MainPanel.test.tsx:79` — "calls setActivityCollapsed when collapse button clicked": mock created but collapse button never clicked and mock never asserted; fix: click the collapse button via `getByLabelText` and assert `toHaveBeenCalledWith(true)`
  - `DocsPanel.test.tsx:47` — "switches tab when tab trigger is clicked": asserts `toHaveLength(4)` before AND after the click — proves nothing; fix: assert `data-state="active"` on the clicked tab after click
  - `DocsPanel.test.tsx:63` — "switches to health tab": `fireEvent.click` inside `waitFor` with no post-click assertion; fix: add `expect(screen.getByRole('tab', { name: /Health/i })).toHaveAttribute('data-state', 'active')` after the click
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
- [x] [qa/P1] Fix DocsPanel.tsx branch coverage (was 61.9%, now 95.23%, need ≥90%)
  - Added overflow dropdown tests (5+ docs), empty docs fallback, extra docs not in docOrder, empty string value skipping
