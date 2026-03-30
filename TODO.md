# Issue #183: Dashboard Component Architecture Refactor

## Current Phase: Implementation

### In Progress
_(none)_

### Up Next

- [x] Extract helper functions from `AppView.tsx` to `lib/` modules (priority: critical)
  - Move `deriveProviderHealth` → `src/lib/deriveProviderHealth.ts`; update `deriveProviderHealth.test.tsx` import
  - Move `toSession` → `src/lib/sessionHelpers.ts`
  - Move `computeAvgDuration` + `latestQaCoverageRefreshSignal` → `src/lib/logHelpers.ts`
  - Update all imports in `AppView.tsx` and consumers; verify all tests still pass (`npm test`)

- [ ] Extract `CommandPalette` + SSE hook to collapse `AppView.tsx` to <100 LOC (priority: critical)
  - Extract `CommandPalette` component → `src/components/shared/CommandPalette.tsx` (with `.test.tsx` and `.stories.tsx`)
  - Extract SSE + state-fetch logic from `AppInner` → `src/hooks/useDashboardState.ts`
  - Make `AppView.tsx` a thin shell: only imports/re-exports + `App` component (<100 LOC)
  - Verify `npm test` passes; verify `parseLogLine.test.tsx` and `deriveProviderHealth.test.tsx` still resolve

- [ ] Split `Header.tsx` (280 LOC) below 200-line limit (priority: high)
  - Extract `QACoverageBadge` → `src/components/shared/QACoverageBadge.tsx`
  - Extract `ConnectionIndicator` if still in Header (already in StatusDot — confirm)
  - `Header.tsx` must stay <200 LOC after extraction; verify tests pass

- [ ] Split `Sidebar.tsx` (255 LOC) below 200-line limit (priority: high)
  - Identify self-contained sub-component(s) to extract (e.g. collapsed sidebar panel, session list item header)
  - `Sidebar.tsx` must stay <200 LOC; update tests as needed

### Deferred

- [ ] Add `.stories.tsx` for sub-components missing them: `ActivityPanel`, `ArtifactComparisonDialog`, `ArtifactComparisonHeader`, `DiffOverlayView`, `ImageLightbox`, `LogEntryExpandedDetails`, `LogEntryRow`, `SideBySideView`, `SliderView`, `ResponsiveLayout` (priority: low)
- [ ] Split large test files (>200 LOC) by feature: `ArtifactComparisonDialog.test.tsx` (481), `Sidebar.test.tsx` (418), `ActivityLog.test.tsx` (282), `LogEntryRow.test.tsx` (232), `LogEntryExpandedDetails.test.tsx` (209) (priority: low)
- [ ] Fix `QACoverageBadge` Storybook story — add MSW mock for `/api/qa-coverage` so the `qa-badge-default` story renders (currently skipped in `story-screenshots.spec.ts` due to P2 bug)

### Completed

- [x] Create `.github/workflows/ci.yml` — dashboard unit tests run on PRs to master
- [x] Configure Storybook 10 with `@storybook/react-vite` in `aloop/dashboard/.storybook/`
- [x] Extract `Sidebar.tsx`, `Header.tsx`, `MainPanel.tsx`, `DocsPanel.tsx`, `ResponsiveLayout.tsx` from AppView — each with `.test.tsx` and `.stories.tsx`
- [x] Extract `SessionCard.tsx`, `SessionDetail.tsx`, `ActivityLog.tsx`, `SteerInput.tsx` — each with tests and stories
- [x] Extract `ProviderHealth.tsx` with tests and stories
- [x] Extract `ElapsedTimer.tsx`, `PhaseBadge.tsx`, `StatusDot.tsx` to `shared/` — each with tests and stories
- [x] Extract `CostDisplay.tsx` to `progress/` — with tests and stories
- [x] Extract `ArtifactViewer.tsx` to `artifacts/` — with tests and stories
- [x] Add 7 Header stories + achieve ≥90% branch coverage on Header.tsx
- [x] Add Sidebar branch coverage tests to ≥92%
- [x] Skip `qa-badge-default` story in `story-screenshots.spec.ts` (P2 bug: needs MSW mock)
- [x] story-screenshots.spec.ts: all non-skipped stories render and screenshot successfully (30 stories)
- [x] proof.spec.ts: responsive layout tests (mobile hamburger, tablet, desktop) all pass
