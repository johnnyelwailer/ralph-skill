# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Storybook scripts in package.json | 2026-03-27 | c45a7759f | PASS | `storybook` and `build-storybook` scripts present, correct port 6006 |
| Storybook devDependencies | 2026-03-27 | c45a7759f | PASS | storybook, @storybook/react-vite, @storybook/react, @storybook/addon-docs, @storybook/addon-themes all installed |
| .storybook/main.ts config | 2026-03-27 | c45a7759f | PASS | @storybook/react-vite framework, stories glob `../src/**/*.stories.@(ts|tsx)` |
| .storybook/preview.ts decorators | 2026-03-27 | c45a7759f | PASS | Tailwind index.css import, withThemeByClassName targeting .dark on html, TooltipProvider wrapper |
| npm run build-storybook | 2026-03-27 | c45a7759f | PASS | 2055 modules transformed, exit 0, static output in storybook-static/ |
| npm run storybook (port 6006) | 2026-03-27 | c45a7759f | PASS | Server ready on http://localhost:6006, HTTP 200 |
| SessionCard component + stories | 2026-03-27 | 862676a99 | PASS | Component extracted to src/components/session/SessionCard.tsx; 10 stories covering Running, Selected, WithCost, Exited, Stopped, phase variants, NoBranch, Stuck, CostUnavailable |
| SteerInput component + stories | 2026-03-27 | 862676a99 | PASS | Component extracted to src/components/session/SteerInput.tsx; 7 stories covering running/paused states and submitting variants |
| SessionCard.test.tsx unit tests | 2026-03-27 | 734a2b7e8 | PASS | All 12 tests pass; covers suppressClick, costUnavailable, cardCost format (4 decimal places), stuckCount>0 |
| SteerInput.test.tsx unit tests | 2026-03-27 | 734a2b7e8 | PASS | All 15 tests pass; covers isRunning stop/resume rendering, Send disabled states, Enter key, Stop/Resume interactions |
| Storybook build after test additions | 2026-03-27 | 734a2b7e8 | PASS | npm run build-storybook exits 0, 17 stories captured as screenshots to proof-artifacts/ |
| Gate 6: Playwright screenshots (SessionCard + SteerInput) | 2026-03-27 | 734a2b7e8 | PASS | All 17 screenshots captured: 10 SessionCard stories + 7 SteerInput stories saved to proof-artifacts/ |
| App.coverage.integration-app.test.ts | 2026-03-27 | 8c71ef05d | PASS | All 295 unit tests pass; previously failing "covers panel toggles, sidebar shortcut, and session switching" now passes after Stop button selector fix |
| ActivityLog component + stories | 2026-03-27 | 8c71ef05d | PASS | ActivityLog.tsx extracted to src/components/session/ActivityLog.tsx; 9 stories (Empty, SessionStart, IterationComplete, WithArtifacts, ErrorIteration, MultipleIterations, RunningIteration, ProviderCooldown, ReviewVerdict); AppView.tsx imports correctly; sidebar shows ActivityLog under SESSION |
| Storybook build after ActivityLog extraction | 2026-03-27 | 8c71ef05d | PASS | npm run build-storybook exits 0, 2062 modules transformed, 105 total stories registered; 9 ActivityLog screenshots saved to proof-artifacts/ |
| ProgressBar component + stories | never | — | FAIL | Component not yet extracted; open task in TODO.md |
| ActivityLog split — ActivityPanel.tsx | 2026-03-27 | a53963ea8 | PASS | 103 LOC, within 150 LOC Constitution target |
| ActivityLog split — ArtifactComparisonDialog.tsx | 2026-03-27 | 11dc2bfec | PASS | Split into 5 sub-components: ArtifactComparisonDialog.tsx 90 LOC, ArtifactComparisonHeader.tsx 71 LOC, SideBySideView.tsx 25 LOC, SliderView.tsx 67 LOC, DiffOverlayView.tsx 48 LOC — all under 150 LOC Constitution target |
| ActivityLog split — LogEntryRow.tsx | 2026-03-27 | 11dc2bfec | FAIL | 287 LOC — still 30% over review gate's ~220 LOC; bug [qa/P2] still open in TODO.md (re-tested iter 69) |
| ActivityLog split — ActivityLog.tsx barrel | 2026-03-27 | a53963ea8 | PASS | 5-line barrel re-exporting all split symbols correctly |
| ActivityLog.test.tsx branch coverage (Gate 3) | 2026-03-27 | a53963ea8 | PASS | All 4 Gate 3 branches covered: withCurrent, deduped session_start, hasResult suppression, loadOutput fetch paths |
| AppView.tsx ActivityLog re-exports | 2026-03-27 | a53963ea8 | PASS | Backward compat re-exports — ArtifactViewer.test.tsx and formatHelpers.test.tsx import from AppView |
| ActivityLog.test.tsx hasResult assertion fix | 2026-03-27 | ef72ead5e | PASS | 307 total tests pass; all 4 hasResult branch tests pass with non-tautological spinner assertions |
| CONSTITUTION.md revert | 2026-03-27 | ef72ead5e | PASS | git status shows no modifications to CONSTITUTION.md |
| npm run build-storybook (post-hasResult fix) | 2026-03-27 | ef72ead5e | PASS | build-storybook exits 0, 105 stories registered |
| ArtifactComparisonDialog split — Gate 4 LOC compliance | 2026-03-27 | 11dc2bfec | PASS | All 5 sub-components under 150 LOC: ArtifactComparisonDialog 90, ArtifactComparisonHeader 71, SideBySideView 25, SliderView 67, DiffOverlayView 48 |
| ArtifactComparisonDialog.test.tsx — Gate 3 branch coverage | 2026-03-27 | 11dc2bfec | PASS | 333 tests pass; all 5 Gate 3 branches covered: mode tabs, ArrowLeft/ArrowRight keyboard, baseline dropdown Number(value), badge colors (<5 green, 5-20 yellow, ≥20 red), no-baseline "first capture" label |
| Storybook build post-ArtifactComparisonDialog split | 2026-03-27 | 11dc2bfec | PASS | build-storybook exits 0 successfully |
| ProgressBar component + stories | 2026-03-27 | 11dc2bfec | FAIL | ProgressBar.tsx not yet extracted from AppView.tsx; [qa/P1] task still open in TODO.md |
