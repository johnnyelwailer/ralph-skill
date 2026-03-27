# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
- [ ] [review] Gate 3: `LogEntryExpandedDetails.tsx` — 4 uncovered branches in new module (≥90% required): (1) `hasOutput=true, outputLoading=true` → loading spinner never tested; (2) `hasOutput=true, outputLoading=false, outputText` non-empty → output text display never tested; (3) `hasOutput=true, outputLoading=false, outputText=''` → "No output available" message never tested; (4) `tokens_cache_read > 0` → cache line display branch never tested. Add test cases for these 4 branches in `LogEntryExpandedDetails.test.tsx` (priority: high)

### Up Next
_(none)_

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
