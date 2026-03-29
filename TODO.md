# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
*(none)*

### Up Next
- [x] [spec-gap/P1] Extract layout shell components from AppView.tsx — batch 1: AppView.tsx is 1299 LOC (spec requires <100). Extract sidebar/session-list logic into `components/layout/Sidebar.tsx` and session detail into `components/session/SessionDetail.tsx`; add .test.tsx and .stories.tsx for each new file. Verify dashboard still renders correctly.
- [ ] [review] Gate 2+3: Sidebar.test.tsx — add context menu tests: (a) right-click renders menu div with `role="menu"` at correct position, (b) "Stop after iteration" button calls `onStopSession(id, false)` and closes menu, (c) "Kill immediately" button calls `onStopSession(id, true)` and closes menu, (d) "Copy session ID" button calls `onCopySessionId(id)` and closes menu, (e) Escape key fires `setContextMenuSessionId(null)`. These are the primary uncovered branches at lines 159 and 215. (priority: high)
- [ ] [review] Gate 2: SessionDetail.test.tsx:45 — `expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1)` is a shallow existence check; rewrite to assert exactly the mobile-toggle button exists, e.g. `expect(screen.getAllByRole('button', { name: /Documents/i }).length).toBeGreaterThanOrEqual(1)` or assert the specific text content renders in the expected element. Same fix needed for line 95 (Activity collapsed check — `getAllByText('Activity') >= 1` passes even if the normal non-collapsed Activity heading is present). (priority: high)
- [ ] [review] Gate 4: SessionDetail.tsx is 297 LOC — Constitution Rule 7 requires < 150 LOC for new modules. Extract `DocContent` + `DocsPanel` into `components/layout/DocsPanel.tsx` (target ≤ 150 LOC with test + story) and the session layout into `components/layout/MainPanel.tsx` (target ≤ 150 LOC with test + story), leaving `SessionDetail.tsx` as a thin re-export wrapper (< 20 LOC). (priority: high)
- [ ] [review] Gate 6: No proof screenshots for 6 Sidebar stories (Default, WithSelectedSession, WithOlderSessions, Collapsed, Desktop, Empty) and 5 SessionDetail stories (Default, WithProviderHealth, ActivityPanelActive, ActivityCollapsed, WithRepoLink). Capture Playwright screenshots for all 11 story variants. (priority: high)
- [ ] [qa/P1] Sidebar.tsx branch coverage 78.46% (lines 83,100,159,215): `npx vitest run --coverage` → branch coverage 78.46% (below 90% spec requirement). Add tests covering uncovered branches. Tested at iter 56. (priority: high)
- [ ] [qa/P2] Sidebar.tsx 255 LOC: spec requires files above 200 LOC to be split (target ~150 LOC). Sidebar.tsx is 255 lines — split or extract a sub-component. Tested at iter 56. (priority: medium)
- [ ] [spec-gap/P1] Extract remaining AppView.tsx logic — batch 2: after batch 1, continue extracting docs/tabs panel into `components/layout/DocsPanel.tsx` and main content area into `components/layout/MainPanel.tsx`; reduce AppView.tsx to layout shell (<100 LOC). Add .test.tsx and .stories.tsx for each new file.
- [ ] [spec-gap/P2] Add .test.tsx for 4 untested components: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `SideBySideView.tsx` — each must cover key props, states, and interactions per SPEC-ADDENDUM.md. (LogEntryRow.test.tsx and SliderView.test.tsx already added.)
- [ ] [spec-gap/P2] Add .stories.tsx for 10 components missing stories: `ActivityPanel.tsx`, `ArtifactComparisonDialog.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `ImageLightbox.tsx`, `LogEntryExpandedDetails.tsx`, `LogEntryRow.tsx`, `ResponsiveLayout.tsx`, `SideBySideView.tsx`, `SliderView.tsx` — each needs 2-3 stories covering key visual states per SPEC-ADDENDUM.md.
- [ ] [spec-gap/P3] Reduce LogEntryRow.tsx from 186 LOC to <150 LOC: extract one small concern (e.g., the expanded toggle header or file-change badge row) into a sub-component. Add test/story for the extracted piece.

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

### Spec-Gap Analysis

**[spec-gap] P1: AppView.tsx remains 1299 LOC — spec requires <100 LOC**
- Spec (SPEC-ADDENDUM.md §Dashboard Component Architecture): "`AppView.tsx` is reduced to <100 LOC (layout shell only)"
- Code: `aloop/cli/dashboard/src/AppView.tsx` — 1299 lines
- Suggested fix: Continue extracting components from AppView.tsx until it is a thin layout shell; the bulk of AppView.tsx logic has not been moved to focused components yet

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
- The refactor is incremental — AppView.tsx still needs significant extraction work
