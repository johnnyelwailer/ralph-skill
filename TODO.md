# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
- [x] [review] Gate 3: `LogEntryExpandedDetails.tsx` — 4 uncovered branches written: (1) loading spinner, (2) non-empty outputText, (3) empty-string outputText → "No output available", (4) `tokens_cache_read > 0`. Tests exist in working tree but are not yet committed.
- [x] [review] Gate 3: `LogEntryExpandedDetails.tsx` — reach ≥90% branch coverage. Two actions required: (1) commit the 4 tests already written in the working tree (`LogEntryExpandedDetails.test.tsx` has 10 tests, 4 are uncommitted); (2) add a test passing a non-null `artifacts` prop (`ManifestPayload` with at least one artifact entry) to cover the `{artifacts && <ArtifactViewer … />}` block at line 71-78 (line 76 reported uncovered). Branch coverage currently 86.95%; ≥90% required for new modules. (priority: high)

### Up Next
- [x] [qa/P1] ImageLightbox.tsx branch coverage 50% (line 5): measured `npx vitest run --coverage --coverage.include='**/ImageLightbox.tsx'` → branch coverage 50% (line 5 uncovered). Spec requires ≥90% branch coverage per component. Add test case covering the untested branch on line 5 of ImageLightbox.tsx. Tested at current iter.
- [x] [qa/P2] vitest.config.ts coverage.include missing new components: `vitest.config.ts` coverage.include now uses `'src/components/**/*.tsx'` glob to include all extracted components. Coverage thresholds enforced for all new files.
- [ ] [spec-gap/P1] Extract layout shell components from AppView.tsx — batch 1: AppView.tsx is 1299 LOC (spec requires <100). Extract sidebar/session-list logic into `components/layout/Sidebar.tsx` and session detail into `components/session/SessionDetail.tsx`; add .test.tsx and .stories.tsx for each new file. Verify dashboard still renders correctly.
- [ ] [spec-gap/P1] Extract remaining AppView.tsx logic — batch 2: after batch 1, continue extracting docs/tabs panel into `components/layout/DocsPanel.tsx` and main content area into `components/layout/MainPanel.tsx`; reduce AppView.tsx to layout shell (<100 LOC). Add .test.tsx and .stories.tsx for each new file.
- [ ] [qa/P1] SliderView.tsx branch coverage 70% (lines 19-26,52): measured `npx vitest run --coverage` → branch coverage 70% (below 90% spec requirement). Spec requires ≥90% branch coverage per component. Add tests covering branches at lines 19-26 and 52 in SliderView.tsx. Tested at iter 23.
- [ ] [qa/P1] LogEntryRow.tsx branch coverage 89.15% (lines 177-183): measured `npx vitest run --coverage` → branch coverage 89.15% (below 90% spec requirement). Spec requires ≥90% branch coverage per component. Add tests covering branches at lines 177-183 in LogEntryRow.tsx. Tested at iter 23.
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

### Spec Review — 2026-03-27

**Scope:** Two most recently completed tasks — "Remove dead prop isCurrentIteration from LogEntryRow" and "Add unit tests for ImageLightbox and LogEntryExpandedDetails".

**Findings:**

- [PASS] `isCurrentIteration` prop removed: grep confirms zero occurrences in `dashboard/src/`. Satisfies SPEC-ADDENDUM.md "typed props" (no dead props).
- [PASS] `ImageLightbox.test.tsx`: 3 tests covering Escape key, overlay click, and img stopPropagation. Satisfies SPEC-ADDENDUM.md "unit tests with Testing Library, covering props, states, interactions".
- [PASS] `LogEntryExpandedDetails.test.tsx`: 6 tests covering file path list, token/cost display, no-cost state, error event detail, comparison dialog shown, comparison dialog hidden. Satisfies SPEC-ADDENDUM.md same requirement.

Pre-existing spec-gaps (P1–P3 above) remain open and are accurately documented — no new gaps introduced by this iteration.

### Notes
- Issue #38 CI workflow (vitest) was previously completed and its tasks remain committed
- The refactor is incremental — AppView.tsx still needs significant extraction work
