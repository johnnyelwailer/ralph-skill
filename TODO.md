# Project TODO

## Current Phase: Issue #183 — Storybook 8 setup with react-vite and Tailwind decorators

### In Progress
- [x] [review] Gate 4: `ArtifactComparisonDialog.tsx` is 219 lines — violates Constitution Rule 7 (< 150 LOC target). Split into: `ArtifactComparisonHeader.tsx` (~60 LOC: header bar with path, diff badge, mode tabs, baseline selector, close button), `SideBySideView.tsx` (~30 LOC), `SliderView.tsx` (~55 LOC: includes drag logic and keyboard handler), `DiffOverlayView.tsx` (~35 LOC) — do this BEFORE adding tests so tests target the split components (priority: high)
- [x] [review] Gate 3: `ArtifactComparisonDialog.tsx` (219 lines, new module) has 0% branch coverage — add tests covering: (1) mode tabs switch between side-by-side/slider/diff-overlay (click each button, verify mode class/content), (2) keyboard ArrowLeft/ArrowRight on the slider `role="slider"` changes sliderPos, (3) baseline dropdown onChange with `Number(value)` sets selectedBaseline, (4) diff_percentage badge color branches (< 5 → green class, 5-20 → yellow class, ≥ 20 → red class), (5) no-baseline path renders "No baseline — first capture" label — write tests against the split components after Gate 4 is done (priority: high)
- [x] [review] Gate 4: `ComparisonMode` type (`'side-by-side' | 'slider' | 'diff-overlay'`) is defined identically in both `ArtifactComparisonDialog.tsx:9` and `ArtifactComparisonHeader.tsx:3` — copy-paste duplication. Export the type from `ArtifactComparisonDialog.tsx` and import it in `ArtifactComparisonHeader.tsx` (or extract to a shared types file). Constitution Rule 10: "Don't duplicate — if two modules do the same thing, factor out the common part." (priority: high)
- [x] [qa/P2] LogEntryRow.tsx is 287 LOC: review gate specified ~220 LOC, actual is 30% over; Constitution Rule 7 targets < 150 LOC — needs further splitting into two focused sub-components: extract `ImageLightbox` (lines 15-27, ~15 LOC) into its own file and extract `LogEntryExpandedDetails` (lines 182-274, ~95 LOC: file changes, artifacts, token/cost row, output viewer, raw event detail) into `src/components/session/LogEntryExpandedDetails.tsx` — this brings LogEntryRow to ~160 LOC (priority: high)

### Up Next
- [ ] [qa/P2] LogEntryRow.tsx is still 186 LOC after ImageLightbox + LogEntryExpandedDetails extraction: task stated "brings LogEntryRow to ~160 LOC" but actual result is 186 LOC; Constitution Rule 7 target is < 150 LOC. Needs further extraction — identify remaining logic (e.g., inline rendering of phase dot, provider·model label, result icon row) that can be factored into small sub-components to bring LogEntryRow under 150 LOC. Tested at iter 70. (priority: medium)
- [ ] [qa/P1] Extract session progress bar section from AppView.tsx into `src/components/session/ProgressBar.tsx` and write `ProgressBar.stories.tsx` — the progress bar section (AppView.tsx lines 591-593, `data-testid="header-progress"`) wraps `ui/progress.tsx` with `progressPercent` and `phaseBarColor` props; also takes `currentPhase` to derive color via `phaseBarColors` lookup (priority: high)

### Completed
- [x] [qa/P2] CONSTITUTION.md has uncommitted modifications: reverted with `git checkout CONSTITUTION.md`
- [x] [review] Gate 2: `ActivityLog.test.tsx:158-177` — tautological assertion fixed: set iterationStartedAt=ts3, assert spinner present
- [x] Add `storybook` and `build-storybook` scripts to `aloop/cli/dashboard/package.json`
- [x] Add all required Storybook devDependencies to `package.json` (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-docs`, `@storybook/addon-themes`)
- [x] Create `aloop/cli/dashboard/.storybook/main.ts` with `@storybook/react-vite` framework and `../src/**/*.stories.@(ts|tsx)` glob
- [x] Create `aloop/cli/dashboard/.storybook/preview.ts` with three global decorators: Tailwind CSS (`index.css` import), dark-mode toggle (`withThemeByClassName` targeting `.dark` on `html`), and `TooltipProvider` wrapper
- [x] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` with light/dark-compatible stories for all button variants and sizes [reviewed: gates 1-9 pass]
- [x] Run `npm install` in `aloop/cli/dashboard/` and fix any dependency resolution errors
- [x] Run `npm run build-storybook` and confirm build completes successfully (confirmed 2026-03-27)
- [x] Verify `npm run storybook` launches on port 6006 (build-check confirmed sufficient)
- [x] [qa/P1] Extract `SessionCard` from AppView.tsx into `src/components/session/SessionCard.tsx` and write `SessionCard.stories.tsx`
- [x] [qa/P1] Extract steer footer UI from AppView.tsx into `src/components/session/SteerInput.tsx` and write `SteerInput.stories.tsx`
- [x] [review] Gate 2+3: Add `SessionCard.test.tsx` — key branches: suppressClick, costUnavailable, cardCost formatting, stuckCount>0 red line
- [x] [review] Gate 2+3: Add `SteerInput.test.tsx` — key branches: isRunning Stop/Resume, Send disabled states, Enter key calls onSteer
- [x] [review] Gate 6: Capture Playwright screenshots for all SessionCard and SteerInput stories and save to proof-artifacts/
- [x] [qa/P1] Fix integration test ambiguous Stop button selector — changed lines 48 and 129 of `App.coverage.integration-app.test.ts` from `screen.findByRole('button', { name: /stop/i })` to `{ name: /stop loop options/i }` targeting only the SteerInput stop button (priority: high)
- [x] [qa/P1] Extract activity log section from AppView.tsx into `src/components/session/ActivityLog.tsx` and write `ActivityLog.stories.tsx` — `ActivityPanel` is currently an exported function inside AppView.tsx (~line 993) and cannot have isolated stories until moved to its own file (priority: high)
- [x] [review] Gate 4: `ActivityLog.tsx` is 616 lines — violates Constitution Rule 7 (< 150 LOC target). Split into at minimum: `ActivityPanel.tsx` (~116 LOC), `LogEntryRow.tsx` (~220 LOC), `ArtifactComparisonDialog.tsx` (~215 LOC), plus keep `findBaselineIterations` in a helpers file. Update imports in AppView.tsx accordingly (priority: high)
- [x] [review] Gate 3: Add `ActivityLog.test.tsx` covering `ActivityPanel`'s untested branches: (1) `withCurrent` memo when `isRunning=false` vs `true`, (2) `deduped` memo deduplicating multiple `session_start` entries, (3) `hasResult` returning true suppresses the synthetic running entry, (4) `loadOutput` fetch success/failure/catch paths in `LogEntryRow` — tests written against split components (priority: high)
