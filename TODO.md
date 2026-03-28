# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
*(none)*

### Up Next
- [x] [qa/P1] SliderView.tsx branch coverage 70% (lines 19-26,52): add SliderView.test.tsx covering mousedown/mousemove/mouseup and ArrowLeft/ArrowRight keyboard branches — verified 90% branch coverage
- [ ] [qa/P1] LogEntryRow.tsx branch coverage 89.15% (lines 177-183): measured `npx vitest run --coverage` → branch coverage 89.15% (below 90% spec requirement). Spec requires ≥90% branch coverage per component. Add tests covering branches at lines 177-183 in LogEntryRow.tsx. Tested at iter 23.
- [ ] [spec-gap/P1] Extract layout shell components from AppView.tsx — batch 1: AppView.tsx is 1299 LOC (spec requires <100). Extract sidebar/session-list logic into `components/layout/Sidebar.tsx` and session detail into `components/session/SessionDetail.tsx`; add .test.tsx and .stories.tsx for each new file. Verify dashboard still renders correctly.
- [ ] [spec-gap/P1] Extract remaining AppView.tsx logic — batch 2: after batch 1, continue extracting docs/tabs panel into `components/layout/DocsPanel.tsx` and main content area into `components/layout/MainPanel.tsx`; reduce AppView.tsx to layout shell (<100 LOC). Add .test.tsx and .stories.tsx for each new file.
- [ ] [spec-gap/P2] Add .test.tsx for 6 untested components: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `LogEntryRow.tsx`, `SideBySideView.tsx`, `SliderView.tsx` — each must cover key props, states, and interactions per SPEC-ADDENDUM.md.
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

### Spec-Gap Analysis

**[spec-gap] P1: AppView.tsx remains 1299 LOC — spec requires <100 LOC**
- Spec (SPEC-ADDENDUM.md §Dashboard Component Architecture): "`AppView.tsx` is reduced to <100 LOC (layout shell only)"
- Code: `aloop/cli/dashboard/src/AppView.tsx` — 1299 lines
- Suggested fix: Continue extracting components from AppView.tsx until it is a thin layout shell; the bulk of AppView.tsx logic has not been moved to focused components yet

**[spec-gap] P2: Missing .test.tsx for 6 components**
- Spec (SPEC-ADDENDUM.md): "Every component in `components/` has a corresponding `.test.tsx` file"
- Missing tests: `ActivityPanel.tsx`, `ArtifactComparisonHeader.tsx`, `DiffOverlayView.tsx`, `LogEntryRow.tsx`, `SideBySideView.tsx`, `SliderView.tsx`
- Suggested fix: Add unit tests for each of these components

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
