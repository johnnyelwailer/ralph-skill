# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
- [x] [review] Gate 3: `LogEntryExpandedDetails.tsx` — 4 uncovered branches in new module (≥90% required): (1) `hasOutput=true, outputLoading=true` → loading spinner never tested; (2) `hasOutput=true, outputLoading=false, outputText` non-empty → output text display never tested; (3) `hasOutput=true, outputLoading=false, outputText=''` → "No output available" message never tested; (4) `tokens_cache_read > 0` → cache line display branch never tested. Add test cases for these 4 branches in `LogEntryExpandedDetails.test.tsx` (priority: high)

### Up Next
- [x] [qa/P1] ImageLightbox.tsx branch coverage 50% (line 5): measured `npx vitest run --coverage --coverage.include='**/ImageLightbox.tsx'` → branch coverage 50% (line 5 uncovered). Spec requires ≥90% branch coverage per component. Add test case covering the untested branch on line 5 of ImageLightbox.tsx. Tested at current iter.
- [ ] [qa/P1] LogEntryExpandedDetails.tsx branch coverage 86.95% after Gate 3 fix (line 76 uncovered): ran `npx vitest run --coverage --coverage.include='**/LogEntryExpandedDetails.tsx'` → branch coverage 86.95%, line 76 uncovered. Gate 3 review added the 4 specified branches but ≥90% spec threshold not met. Add test case covering the branch at line 76. Tested at iter 22. (priority: high)
- [ ] [qa/P2] vitest.config.ts coverage.include missing new components: `vitest.config.ts` coverage.include only lists App.tsx, AppView.tsx, useIsTouchDevice.ts, tooltip.tsx, hover-card.tsx — newly extracted components (ImageLightbox, LogEntryExpandedDetails, ActivityPanel, ArtifactComparisonHeader, etc.) are excluded. Branch coverage thresholds cannot be enforced for these files. Add all components/session/*.tsx and other new files to coverage.include. Tested at current iter.
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
