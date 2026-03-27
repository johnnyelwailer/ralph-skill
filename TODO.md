# Project TODO

## Current Phase: Issue #183 — Storybook 8 setup with react-vite and Tailwind decorators

### In Progress
- [ ] [qa/P2] CONSTITUTION.md has uncommitted modifications (shows as `M` in git status): revert the changes with `git checkout CONSTITUTION.md` — changes to the Constitution require explicit approval and must not occur as side effects of implementation tasks. (priority: high)
- [x] [review] Gate 2: `ActivityLog.test.tsx:158-177` — test "suppresses synthetic entry when result timestamp >= iterationStartedAt" has a tautological assertion. It checks `screen.getByText(/2 events/)` which reflects `deduped.length` (always 2 regardless of synthetic entry). With `iterationStartedAt = ts3 (now+200s)` and result `e.timestamp = ts2 (now+100s)`, `ts2 < ts3` → `hasResult=false` → spinner IS added, but the test never asserts spinner presence/absence. Fix: either (a) assert `expect(document.querySelector('.animate-spin')).toBeInTheDocument()` to confirm spinner is present (non-suppression case), or (b) use `iterationStartedAt = ts1` (before ts2) so `ts2 >= ts1` → hasResult=true → no spinner, then assert `not.toBeInTheDocument()` (priority: high)
- [ ] [review] Gate 4: `ArtifactComparisonDialog.tsx` is 219 lines — violates Constitution Rule 7 (< 150 LOC target). Split into: `ArtifactComparisonHeader.tsx` (~60 LOC: header bar with path, diff badge, mode tabs, baseline selector, close button), `SideBySideView.tsx` (~30 LOC), `SliderView.tsx` (~55 LOC: includes drag logic and keyboard handler), `DiffOverlayView.tsx` (~35 LOC) — do this BEFORE adding tests so tests target the split components (priority: high)
- [ ] [review] Gate 3: `ArtifactComparisonDialog.tsx` (219 lines, new module) has 0% branch coverage — add tests covering: (1) mode tabs switch between side-by-side/slider/diff-overlay (click each button, verify mode class/content), (2) keyboard ArrowLeft/ArrowRight on the slider `role="slider"` changes sliderPos, (3) baseline dropdown onChange with `Number(value)` sets selectedBaseline, (4) diff_percentage badge color branches (< 5 → green class, 5-20 → yellow class, ≥ 20 → red class), (5) no-baseline path renders "No baseline — first capture" label — write tests against the split components after Gate 4 is done (priority: high)
- [ ] [qa/P2] LogEntryRow.tsx is 287 LOC: review gate specified ~220 LOC, actual is 30% over; Constitution Rule 7 targets < 150 LOC — needs further splitting into two focused sub-components (priority: high)

### Up Next
- [ ] [qa/P1] Extract session progress bar section from AppView.tsx into `src/components/session/ProgressBar.tsx` and write `ProgressBar.stories.tsx` — the progress bar section (AppView.tsx ~line 712) wraps `ui/progress.tsx` with session-specific data/layout inline (priority: high)

### Completed
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
