# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
- [x] [spec-gap/P1] Extract layout shell components — batch 2: DocsPanel.tsx (99 LOC), MainPanel.tsx (148 LOC), and SessionDetail.tsx thin re-export (104 LOC) extracted and committed. SessionDetail.tsx is now a thin re-export of MainPanel retaining DocContent/slugify utilities.

### Up Next
- [x] [review] Gate 2: Fix weak assertions in SessionDetail.test.tsx — line 45: rewrite `expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1)` to `expect(screen.getAllByRole('button', { name: /Documents/i }).length).toBeGreaterThanOrEqual(1)`; line 95: rewrite `expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(1)` to assert the collapsed activity icon-button specifically (e.g. `expect(screen.getByLabelText('Show activity panel')).toBeInTheDocument()` or similar). These are shallow checks that pass even when the wrong element renders. (priority: high)
- [x] [review] Gate 2: Fix weak assertions in MainPanel.test.tsx (uncommitted) — lines 49, 72, and 96 use `expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1)` which will fail the same review gate as SessionDetail.test.tsx. Replace with role-based assertions targeting the mobile toggle button specifically. Fix before committing the batch-2 work. (priority: high)
- [ ] [review] Gate 2+3: Sidebar.test.tsx — add context menu tests: (a) right-click renders menu div with `role="menu"` at correct position, (b) "Stop after iteration" button calls `onStopSession(id, false)` and closes menu, (c) "Kill immediately" button calls `onStopSession(id, true)` and closes menu, (d) "Copy session ID" button calls `onCopySessionId(id)` and closes menu, (e) Escape key fires `setContextMenuSessionId(null)`. These are the primary uncovered branches at lines 159 and 215. (priority: high)
- [ ] [review] Gate 6: No proof screenshots for 6 Sidebar stories (Default, WithSelectedSession, WithOlderSessions, Collapsed, Desktop, Empty) and 5 SessionDetail stories (Default, WithProviderHealth, ActivityPanelActive, ActivityCollapsed, WithRepoLink), plus 6 DocsPanel stories and 6 MainPanel stories added in batch-2. Capture Playwright screenshots for all story variants. (priority: high)
- [ ] [qa/P1] Sidebar.tsx branch coverage 78.46% (lines 83,100,159,215): `npx vitest run --coverage` → branch coverage 78.46% (below 90% spec requirement). Add tests covering uncovered branches — context menu tests (Gate 2+3 above) will also close most of these coverage gaps. Tested at iter 56. Still failing at iter 57. (priority: high)
- [ ] [qa/P1] DocsPanel.tsx branch coverage 85.71% (line 37): `npx vitest run --coverage` → branch coverage 85.71% (below 90% spec requirement). Line 37 is the `useEffect` branch that resets `activeTab` when it becomes invalid — add a test where `allDocs` changes to exclude the current `activeTab`, triggering the reset path. Tested at iter 57. (priority: high)
- [ ] [qa/P2] Sidebar.tsx 255 LOC: spec requires files above 200 LOC to be split (target ~150 LOC). Sidebar.tsx is 255 lines — extract context menu render logic into a sub-component (e.g. `SidebarContextMenu.tsx`). (priority: medium)
- [ ] [spec-gap/P1] Reduce AppView.tsx to layout shell (<100 LOC) — batch 3: AppView.tsx is 823 LOC after batch 1. Continue extracting: helper functions (`toSession`, `computeAvgDuration`, `parseQACoveragePayload`, phase/status color maps) into dedicated utility modules, and the main `AppView` component body into a focused layout shell. Add .test.tsx and .stories.tsx for each new file. (priority: high)
- [ ] [spec-gap/P2] Add .test.tsx for 4 untested components: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `SideBySideView.tsx` — each must cover key props, states, and interactions per SPEC-ADDENDUM.md. (LogEntryRow.test.tsx and SliderView.test.tsx already added.) (priority: medium)
- [ ] [spec-gap/P2] Add .stories.tsx for 10 components missing stories: `ActivityPanel.tsx`, `ArtifactComparisonDialog.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `ImageLightbox.tsx`, `LogEntryExpandedDetails.tsx`, `LogEntryRow.tsx`, `ResponsiveLayout.tsx`, `SideBySideView.tsx`, `SliderView.tsx` — each needs 2-3 stories covering key visual states per SPEC-ADDENDUM.md. (priority: medium)
- [ ] [spec-gap/P3] Reduce LogEntryRow.tsx from 186 LOC to <150 LOC: extract one small concern (e.g., the expanded toggle header or file-change badge row) into a sub-component. Add test/story for the extracted piece. (priority: low)

### Completed
- [x] Split ActivityLog.tsx into ActivityPanel, LogEntryRow, ArtifactComparisonDialog
- [x] Split ArtifactComparisonDialog into focused sub-components (ArtifactComparisonHeader, DiffOverlayView, SideBySideView, SliderView)
- [x] Deduplicate ComparisonMode type by exporting from ArtifactComparisonDialog
- [x] Extract ImageLightbox and LogEntryExpandedDetails from LogEntryRow
- [x] Remove dead prop isCurrentIteration from LogEntryRow
- [x] Add unit tests for ImageLightbox and LogEntryExpandedDetails
- [x] [review] Gate 3: `LogEntryExpandedDetails.tsx` — reach ≥90% branch coverage (93.47% achieved, gates 1-9 pass)
- [x] [qa/P1] ImageLightbox.tsx branch coverage 50% (line 5): add test covering untested branch — verified passing
- [x] [qa/P2] vitest.config.ts coverage.include missing new components: now uses `'src/components/**/*.tsx'` glob — reviewed: gates 1-9 pass
- [x] [qa/P1] SliderView.tsx branch coverage 70% (lines 19-26,52): add SliderView.test.tsx covering mousedown/mousemove/mouseup and ArrowLeft/ArrowRight keyboard branches — verified 90% branch coverage at iter 52
- [x] [qa/P1] LogEntryRow.tsx branch coverage 89.15% (lines 177-183): measured `npx vitest run --coverage` → branch coverage 89.15% (below 90% spec requirement). Spec requires ≥90% branch coverage per component. Add tests covering branches at lines 177-183 in LogEntryRow.tsx. Verified 93.97% at iter 52.
- [x] [review] Gate 2: `LogEntryRow.test.tsx:147-165` — add assertion `expect(screen.getByTestId('close-comparison')).toBeInTheDocument()` after clicking `trigger-comparison` to prove `onComparison` updated state — gates 1-9 pass
- [x] [review] Gate 2: `LogEntryRow.test.tsx:167-186` — add `expect(screen.queryByTestId('close-comparison')).not.toBeInTheDocument()` after close button click to verify state was cleared — gates 1-9 pass
- [x] [qa/P1] ResponsiveLayout.tsx branch coverage: add tests for `setSidebarOpen(value)` on non-desktop and `useResponsiveLayout()` outside provider — ≥90% branch coverage achieved, gates 1-9 pass
- [x] [spec-gap/P1] Extract layout shell components from AppView.tsx — batch 1: extracted Sidebar.tsx (255 LOC) and SessionDetail.tsx into `components/layout/Sidebar.tsx` and `components/session/SessionDetail.tsx`; added .test.tsx and .stories.tsx for each. AppView.tsx reduced from 1299 → 823 LOC.
- [x] [spec-gap/P1] Extract layout shell components — batch 2: DocsPanel.tsx (99 LOC) and MainPanel.tsx (148 LOC) extracted; SessionDetail.tsx is now a thin re-export (104 LOC). All have .test.tsx and .stories.tsx.

### Spec-Gap Analysis

**[spec-gap] P1: AppView.tsx remains 823 LOC — spec requires <100 LOC**
- Spec (SPEC-ADDENDUM.md §Dashboard Component Architecture): "`AppView.tsx` is reduced to <100 LOC (layout shell only)"
- Code: `aloop/cli/dashboard/src/AppView.tsx` — 823 lines (down from 1299 after batch 1)
- Suggested fix: Continue extracting components and helpers from AppView.tsx until it is a thin layout shell (batch 3 and beyond)

**[spec-gap] P2: Missing .test.tsx for 4 components**
- Spec (SPEC-ADDENDUM.md): "Every component in `components/` has a corresponding `.test.tsx` file"
- Missing tests: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `SideBySideView.tsx`
- Already added: `LogEntryRow.test.tsx`, `SliderView.test.tsx`
- Suggested fix: Add unit tests for each remaining component

**[spec-gap] P2: Missing .stories.tsx for 10 components**
- Spec (SPEC-ADDENDUM.md): "Every component in `components/` has a corresponding `.stories.tsx` file"
- Missing stories: `ActivityPanel.tsx`, `ArtifactComparisonDialog.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `ImageLightbox.tsx`, `LogEntryExpandedDetails.tsx`, `LogEntryRow.tsx`, `ResponsiveLayout.tsx`, `SideBySideView.tsx`, `SliderView.tsx`
- Suggested fix: Add Storybook stories for each of these components

**[spec-gap] P3: LogEntryRow.tsx is 186 LOC (target ~150 LOC)**
- Spec (SPEC-ADDENDUM.md): "Target: ~150 LOC per file. Files above 200 LOC should be split."
- Code: `aloop/cli/dashboard/src/components/session/LogEntryRow.tsx` — 186 lines (within 200 LOC limit but over ~150 target)
- Note: already flagged in QA commit (iter 70): "LogEntryRow still 186 LOC (bug filed)"
- Suggested fix: Extract one more small concern from LogEntryRow to bring it under 150 LOC

### Notes
- Issue #38 CI workflow (vitest) was previously completed and its tasks remain committed
- The refactor is incremental — AppView.tsx still needs significant extraction work (batch 3+)
- Batch-2 committed: DocsPanel.tsx + MainPanel.tsx extracted from SessionDetail.tsx; SessionDetail.tsx is now a thin re-export (104 LOC); all have .test.tsx and .stories.tsx
