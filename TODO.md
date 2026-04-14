# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Current Status

`AppView.tsx` is 1393 LOC. The following components still need extraction:
- `Sidebar` (~305 LOC)
- `ActivityPanel` + `LogEntryRow` (~360 LOC combined)
- `ArtifactComparisonDialog` + `ImageLightbox` (~220 LOC combined)
- `CommandPalette` (~40 LOC)
- `AppInner` state/SSE logic (~380 LOC)

Already extracted (with issues): `Header.tsx` (385 LOC — exceeds 200 LOC limit), `DocsPanel.tsx` (204 LOC — exceeds 200 LOC limit), `Footer.tsx` (66 LOC — OK).

## Tasks

### QA Bugs

- [x] [qa/P1] **Fix type-check errors** — `npm run type-check` exits 2 with 5 errors: (1) `Sidebar` gained required `sessionCost` prop but `App.coverage.test.ts:636` passes no `sessionCost`, (2) `TooltipProvider` missing `children` at lines 636/674/695, (3) `DocsPanel.test.tsx:85` passes `null` where `string` is required. Fix the type errors in the test files and/or fix prop definitions to use optional types where appropriate. (priority: high)

- [x] [qa/P1] **Fix 3 failing tests in App.coverage.test.ts** — (1) "covers panel toggles" finds multiple buttons matching /activity/i, (2) "covers older-session grouping" — `container.querySelector('aside .mt-3 button')` returns null after sidebar toggle, (3) "covers ActivityPanel and LogEntryRow exhaustive" — `findByText('a.png')` fails. Investigate and fix selectors/assertions. (priority: high)

- [ ] [qa/P1] **Trim DocsPanel.tsx to ≤200 LOC** — extracted `src/components/layout/DocsPanel.tsx` is 204 LOC (4 lines over limit). Extract a sub-component (e.g. `HealthPanel`) into a separate file, or remove redundant code to get under 200 LOC. (priority: high)

### In Progress

### Up Next

- [ ] **Extract `Sidebar.tsx`** — Move `Sidebar` component (~305 LOC) to `src/components/layout/Sidebar.tsx`. Split out `SessionCard` inner component to a separate file to keep each file ≤200 LOC. Re-export from AppView.tsx for backward compatibility. Add a render test.

- [ ] **Extract `ActivityPanel` and `LogEntryRow`** — Move `ActivityPanel` to `src/components/activity/ActivityPanel.tsx` and `LogEntryRow` to `src/components/activity/LogEntryRow.tsx`. Move `ArtifactComparisonDialog` + `ImageLightbox` to `src/components/activity/` or `src/components/artifacts/`. Keep each file ≤200 LOC. Re-export from AppView.tsx. Add render tests.

- [ ] **Extract `CommandPalette`** — Move `CommandPalette` (~40 LOC) to `src/components/layout/CommandPalette.tsx`. Re-export from AppView.tsx. Add a render test.

- [ ] **Extract custom hooks** — Extract three major logic blobs from `AppInner()` into:
  - `src/hooks/useSSE.ts` — SSE connection + state updates (`connectSSE`, `load`, reconnect logic, `connectionStatus`, `qaCoverageRefreshKey`)
  - `src/hooks/useSession.ts` — Session selection, URL sync, session list derivation
  - `src/hooks/useSteering.ts` — `handleSteer`, `handleStop`, `handleResume` with submitting states
  Each hook must be <150 LOC with tests.

- [ ] **Create `MainPanel.tsx`** — `src/components/layout/MainPanel.tsx` composing: `<Header>`, activity panel area (`ActivityPanel`), mobile panel toggle tabs, and `<Footer>` at the bottom. Props: all data Header and Footer need, plus ActivityPanel props. ≤200 LOC.

- [ ] **Create `AppShell.tsx`** — `src/components/layout/AppShell.tsx` using `react-resizable-panels` (shadcn wrapper at `@/components/ui/resizable`). Three-panel layout: `<Sidebar>` | `<MainPanel>` | `<DocsPanel>`. Handle responsive breakpoints: mobile (stacked/drawer), tablet (2-panel), desktop (3-panel). Keyboard shortcut `Ctrl+B` toggles sidebar. ≤200 LOC. Add a render test.

- [ ] **Reduce `AppView.tsx` to <100 LOC shell** — `AppInner` becomes a thin shell that calls `useSSE`, `useSession`, `useSteering`, renders `<AppShell>`, handles `Ctrl+K`/`Escape`, and renders `<CommandPalette>` and `<Toaster>`. Remove all extracted component definitions. Keep re-exports for backward compatibility.

- [ ] **Split `Header.tsx` to ≤200 LOC** — `Header.tsx` is 385 LOC. Extract sub-components (`QACoverageBadge`, `PhaseBadge`, `StatusDot`, `ConnectionIndicator`, `ElapsedTimer`) to `src/components/layout/HeaderBadges.tsx`. Keep `Header.tsx` as the main component that imports from `HeaderBadges.tsx`. Each file ≤200 LOC.

- [ ] **Update `App.tsx` re-exports** — Verify all symbols re-exported from App.tsx still resolve after the full refactor (Sidebar, ActivityPanel, DocContent, HealthPanel, ArtifactComparisonDialog, all utility functions). Update import paths as needed.

- [ ] **Final validation** — Run `npm run type-check && npm test` to confirm all acceptance criteria pass: AppView.tsx <100 LOC, no source file >200 LOC (excluding ui/ primitives), all tests pass.

### Completed

- [x] **Extract `Footer.tsx`** — Moved `Footer` component to `src/components/layout/Footer.tsx` (66 LOC). Re-exported from AppView.tsx.

- [x] **Extract `Header.tsx`** — Moved `Header` and related components to `src/components/layout/Header.tsx`. Re-exported from AppView.tsx. (Note: still 385 LOC — split task added to Up Next.)

- [x] **Extract `DocsPanel.tsx`** — Moved `DocsPanel`, `DocContent`, `HealthPanel` to `src/components/layout/DocsPanel.tsx`. Re-exported from AppView.tsx. (Note: 204 LOC — trim task added to QA Bugs.)
