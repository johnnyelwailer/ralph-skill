# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Current Phase: Dashboard component extraction + test quality fixes

### In Progress

- [x] [review] Gate 3: DocsPanel.tsx branch coverage still 85.71% after test fixes — add test to cover `useEffect` reset branch at line 37; render with `docs` containing `TODO.md`, then re-render with `docs` omitting `TODO.md` entirely (so `activeTab === 'TODO.md'` is no longer valid), assert the active tab falls back to the new default (priority: critical)
- [x] [review] Gate 4: `playwright.stories.config.ts:6` — `const artifactDir = path.resolve(...)` is defined but never referenced in `defineConfig`; delete it (priority: low)
- [x] [review] Gate 2: `DocsPanel.test.tsx:145-160` — `switches to overflow tab via dropdown menu` clicks the EXTRA dropdown menuitem at line 159 but has no post-click assertion; the tab switch is completely unverified. Add `expect(screen.getByRole('tab', { name: 'EXTRA' })).toHaveAttribute('data-state', 'active')` after the final `await user.click(...)` call. (priority: high)
- [x] [review] Gate 4 (follow-up): `playwright.stories.config.ts:1-2,5` — Gate 4 fix was incomplete; deleting `artifactDir` renamed it to `currentDir` but left it unused. Lines 1 (`import path from 'node:path'`), 2 (`import { fileURLToPath } from 'node:url'`), and 5 (`const currentDir = path.dirname(...)`) are all dead code — none referenced in `defineConfig`. Delete all three lines. (priority: low)
- [ ] [review] Gate 2: `Sidebar.test.tsx` — 4 cost API branch tests (`handles cost API returning opencode_unavailable error`, `handles cost API returning string total_usd`, `handles cost API returning non-number non-string total_usd`, `handles cost API fetch rejection`) all assert only `expect(mockFetch).toHaveBeenCalled()`. A broken handler (e.g., `setCostUnavailable` never called, `parseFloat` removed) would still pass these tests. Fix: expand the "Older" section first (`fireEvent.click(screen.getByText('Older').closest('button')!)`), then assert rendered output: (a) `opencode_unavailable` → `await waitFor(() => expect(screen.getByText('Cost: unavailable')).toBeInTheDocument())`; (b) `string '2.50'` → assert `$2.5000` appears in the card; (c) `null` and `rejection` → assert no "Cost:" text is rendered. (priority: high)

### Up Next

- [x] [qa/P1] Fix Sidebar.tsx branch coverage (was 78.46%, now 92.3%, need ≥90%)
  - Added context menu tests: right-click renders menu at correct position, "Stop after iteration"/"Kill immediately"/"Copy session ID" actions + close, Escape key dismisses menu
  - Added older sessions collapse toggle test
  - Added cost API response branch tests (string, null, rejection, opencode_unavailable)
  - Added collapsed state tests (current id → null, non-current id)
  - Added selectedSessionId matching tests
  - Added "current" expanded session click → null branch
  - Added suppress-click-after-context-menu test

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
