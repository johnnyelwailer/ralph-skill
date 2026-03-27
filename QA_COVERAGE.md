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
| App.coverage.integration-app.test.ts | 2026-03-27 | 734a2b7e8 | FAIL | "covers panel toggles, sidebar shortcut, and session switching" fails: findByRole('button',{name:/stop/i}) matches 2 elements after SteerInput extraction; bug filed [qa/P1] |
| ActivityLog component + stories | never | — | FAIL | Component not yet extracted; open task in TODO.md |
| ProgressBar component + stories | never | — | FAIL | Component not yet extracted; open task in TODO.md |
