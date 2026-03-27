# Project TODO

## Current Phase: Issue #183 — Storybook 8 setup with react-vite and Tailwind decorators

### In Progress
- [ ] [review] Gate 3: `ActivityLog.tsx` has no unit tests — add `ActivityLog.test.tsx` covering `ActivityPanel`'s untested branches: (1) `withCurrent` memo when `isRunning=false` vs `true`, (2) `deduped` memo deduplicating multiple `session_start` entries, (3) `hasResult` returning true suppresses the synthetic running entry, (4) `loadOutput` fetch success/failure/catch paths in `LogEntryRow` (priority: high)
- [ ] [review] Gate 4: `ActivityLog.tsx` is 616 lines — violates Constitution Rule 7 (< 150 LOC target). Split into at minimum: `ActivityPanel.tsx` (~116 LOC), `LogEntryRow.tsx` (~220 LOC), `ArtifactComparisonDialog.tsx` (~215 LOC), plus keep `findBaselineIterations` in a helpers file. Update imports in AppView.tsx accordingly (priority: high)

### Bugs

### Up Next
- [x] [qa/P1] Fix integration test ambiguous Stop button selector — changed lines 48 and 129 of `App.coverage.integration-app.test.ts` from `screen.findByRole('button', { name: /stop/i })` to `{ name: /stop loop options/i }` targeting only the SteerInput stop button (priority: high)
- [x] [qa/P1] Extract activity log section from AppView.tsx into `src/components/session/ActivityLog.tsx` and write `ActivityLog.stories.tsx` — `ActivityPanel` is currently an exported function inside AppView.tsx (~line 993) and cannot have isolated stories until moved to its own file (priority: high)
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
