# Issue #183: Dashboard Component Decomposition + Storybook Stories

## Current Phase: Component Extraction

### Up Next

- [x] Verify `storybook build` produces static output without errors — run `npx storybook build` from `aloop/cli/dashboard/`. Confirms Storybook 10 upgrade is clean and the pipeline works before adding more stories. (priority: high)

- [ ] Extract shared utility modules from AppView.tsx — create `src/lib/ansi.ts` (ANSI escape parser), `src/lib/format.ts` (duration, tokens, cost formatters), `src/lib/types.ts` (shared TypeScript interfaces). No UI dependencies; foundational step before extracting components. Each file ~150 LOC, no tests required for pure-utility modules that get tested via component tests. (priority: high)

- [ ] Add `CostDisplay.stories.tsx` — add Storybook stories for the already-extracted `CostDisplay` component. Include stories for: no data/loading state, healthy spend (<70%), warning (70-90%), critical (>90%), opencode unavailable fallback. Satisfies Storybook AC "at least one story for each core dashboard component — ProgressBar". (priority: high)

- [ ] Extract `HealthIndicator` and `LogEntry` leaf components — create `src/components/health/HealthIndicator.tsx` (single provider status dot + label, ~80 LOC) and `src/components/activity/LogEntry.tsx` (single log line with expand/collapse, ~120 LOC). Each needs `.test.tsx` and `.stories.tsx`. Extract from AppView.tsx without changing behavior. (priority: high)

- [ ] Extract `ActivityLog` composite component — create `src/components/activity/ActivityLog.tsx` (~150 LOC) from AppView.tsx. Uses `LogEntry`. Needs `.test.tsx` and `.stories.tsx`. Satisfies Storybook AC "at least one story for ActivityLog". (priority: high)

- [ ] Extract `SessionCard` composite component — create `src/components/session/SessionCard.tsx` (~150 LOC) from AppView.tsx session list item. Needs `.test.tsx` and `.stories.tsx`. Satisfies Storybook AC "at least one story for SessionCard". (priority: high)

- [ ] Extract `ProviderHealth` composite component — create `src/components/health/ProviderHealth.tsx` (~150 LOC) from AppView.tsx. Uses `HealthIndicator`. Needs `.test.tsx` and `.stories.tsx`. Satisfies Storybook AC "at least one story for ProviderHealth". (priority: high)

- [ ] Extract `SteerInput` composite component — create `src/components/steering/SteerInput.tsx` (~150 LOC) from AppView.tsx. Needs `.test.tsx` and `.stories.tsx`. Satisfies Storybook AC "at least one story for SteerInput". (priority: high)

- [ ] Extract `SessionList` and `SessionDetail` components — create `src/components/session/SessionList.tsx` and `src/components/session/SessionDetail.tsx` from AppView.tsx. Each needs `.test.tsx` and `.stories.tsx`. (priority: medium)

- [ ] Extract `IterationProgress` and `CycleIndicator` components — create `src/components/progress/IterationProgress.tsx` and `src/components/progress/CycleIndicator.tsx` from AppView.tsx. Each needs `.test.tsx` and `.stories.tsx`. (priority: medium)

- [ ] Extract shared display components — create `src/components/shared/AnsiRenderer.tsx`, `src/components/shared/ElapsedTimer.tsx`, `src/components/shared/MarkdownRenderer.tsx`. Each needs `.test.tsx` and `.stories.tsx`. (priority: medium)

- [ ] Extract layout components and reduce AppView.tsx to shell — create `src/components/layout/Sidebar.tsx`, `MainPanel.tsx`, `DocsPanel.tsx`, `AppShell.tsx` from AppView.tsx. After extraction, AppView.tsx must be <100 LOC (layout wiring only). Each layout component needs `.test.tsx` and `.stories.tsx`. Satisfies: "No source file in dashboard/src/ exceeds 200 LOC" and "AppView.tsx reduced to <100 LOC". (priority: medium)

- [ ] Extract spec-required hooks — create `src/hooks/useSession.ts`, `src/hooks/useSSE.ts`, `src/hooks/useSteering.ts`, `src/hooks/useTheme.ts` from AppView.tsx. Each needs `.test.ts`. (priority: medium)

### Completed

- [x] Install Storybook devDependencies and add `storybook`/`build-storybook` scripts to `package.json`
- [x] Create `.storybook/main.ts` with `@storybook/react-vite` framework and stories glob
- [x] Create `.storybook/preview.ts` with Tailwind + dark mode global decorator (`withThemeByClassName`) and `TooltipProvider` wrapper
- [x] Upgrade Storybook 8 to 10.x (replaced `addon-essentials` with `addon-docs`)
- [x] Add `button.stories.tsx` and UI primitive stories (card, collapsible, command, dropdown-menu, hover-card, progress, resizable, scroll-area, sonner, tabs, textarea, tooltip)
- [x] Extract `CostDisplay` component (`src/components/progress/CostDisplay.tsx`, 95 LOC, with test)
- [x] Add touch interaction hooks: `useIsTouchDevice`, `useLongPress`, `useCost`
