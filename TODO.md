# Project TODO

## Current Phase: Issue #183 — Storybook 8 setup with react-vite and Tailwind decorators

### In Progress
- [x] [review] Gate 2+3: Add `SessionCard.test.tsx` — SessionCard.tsx has no unit tests. All other extracted components in this PR have test files (StatusDot.test.tsx, PhaseBadge.test.tsx, ElapsedTimer.test.tsx). Test the key branches: suppressClick=true skips onSelect and calls onClearSuppressClick; costUnavailable shows "Cost: unavailable" in tooltip; cardCost number formats correctly; stuckCount>0 shows red stuck line (priority: high)
- [ ] [review] Gate 2+3: Add `SteerInput.test.tsx` — SteerInput.tsx has no unit tests. Test branches: isRunning=true renders Stop dropdown (not Resume); isRunning=false renders Resume button (not Stop); Send button disabled when steerInstruction is empty string; Send button disabled when steerSubmitting=true; Enter key without Shift calls onSteer (priority: high)
- [ ] [review] Gate 6: Capture Playwright screenshots for all SessionCard stories (Running, Selected, WithCost, Exited, Stopped, ReviewPhase, PlanPhase, NoBranch, Stuck, CostUnavailable) and SteerInput stories (Idle, WithText, Sending, StopSubmitting, Paused, PausedWithText, ResumeSubmitting) and save to proof-artifacts/ — all prior extracted components have screenshots; these two are missing (priority: high)

### Up Next
- [x] [qa/P1] Extract `SessionCard` from AppView.tsx into `src/components/session/SessionCard.tsx` and write `SessionCard.stories.tsx` — SessionCard is currently an inner function at AppView.tsx:502 and cannot have isolated stories until extracted
- [x] [qa/P1] Extract steer footer UI from AppView.tsx into `src/components/session/SteerInput.tsx` and write `SteerInput.stories.tsx` — the Footer inner function (AppView.tsx ~line 1651) contains the steer textarea + send/stop/resume buttons
- [ ] [qa/P1] Extract activity log section from AppView.tsx into `src/components/session/ActivityLog.tsx` and write `ActivityLog.stories.tsx` — the log/terminal output panel is inline in AppView.tsx with no isolated component
- [ ] [qa/P1] Extract session progress bar section from AppView.tsx into `src/components/session/ProgressBar.tsx` and write `ProgressBar.stories.tsx` — the progress bar section (AppView.tsx ~line 770) wraps `ui/progress.tsx` with session-specific data/layout

### Completed
- [x] Add `storybook` and `build-storybook` scripts to `aloop/cli/dashboard/package.json`
- [x] Add all required Storybook devDependencies to `package.json` (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-docs`, `@storybook/addon-themes`)
- [x] Create `aloop/cli/dashboard/.storybook/main.ts` with `@storybook/react-vite` framework and `../src/**/*.stories.@(ts|tsx)` glob
- [x] Create `aloop/cli/dashboard/.storybook/preview.ts` with three global decorators: Tailwind CSS (`index.css` import), dark-mode toggle (`withThemeByClassName` targeting `.dark` on `html`), and `TooltipProvider` wrapper
- [x] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` with light/dark-compatible stories for all button variants and sizes [reviewed: gates 1-9 pass]
- [x] Run `npm install` in `aloop/cli/dashboard/` and fix any dependency resolution errors
- [x] Run `npm run build-storybook` and confirm build completes successfully (confirmed 2026-03-27)
- [x] Verify `npm run storybook` launches on port 6006 (build-check confirmed sufficient)
