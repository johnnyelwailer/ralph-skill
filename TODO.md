# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Current Status

`AppView.tsx` is 1590 LOC. `Header.tsx` (385 LOC) and `Footer.tsx` (66 LOC) were extracted in prior PRs. The following components still live in AppView.tsx and need extraction:
- `Sidebar` (~305 LOC, lines ~68–370)
- `DocsPanel` + `DocContent` + `HealthPanel` (~194 LOC combined, lines ~375–567)
- `ActivityPanel` + `LogEntryRow` (~360 LOC combined, lines ~570–926)
- `ArtifactComparisonDialog` + `ImageLightbox` (~220 LOC combined, lines ~927–1162)
- `CommandPalette` (~40 LOC, lines ~1163–1202)
- `AppInner` state/SSE logic (~380 LOC, lines ~1203–1581)

Note: `Header.tsx` is 385 LOC which exceeds the 200 LOC spec limit and needs to be split.

## Tasks

### QA Bugs

- [ ] [qa/P1] type-check fails after DocsPanel extraction: `npm run type-check` exits 2 with 5 errors — (1) `Sidebar` gained required `sessionCost` prop but `App.coverage.test.ts:636` passes no `sessionCost`, (2) `TooltipProvider` missing `children` at lines 636/674/695, (3) `DocsPanel.test.tsx:85` passes `null` where `string` is required. Spec acceptance criterion "npm run type-check passes" → FAIL. Tested at iter 1. (priority: high)

- [ ] [qa/P1] 3 tests fail after DocsPanel/Header extraction: `App.coverage.test.ts` has 3 failures — (1) "covers panel toggles" finds multiple buttons matching /activity/i, (2) "covers older-session grouping" — `container.querySelector('aside .mt-3 button')` returns null after sidebar toggle, (3) "covers ActivityPanel and LogEntryRow exhaustive" — `findByText('a.png')` fails to find element. Spec acceptance criterion "All existing tests pass" → FAIL. Tested at iter 1. (priority: high)

- [ ] [qa/P1] DocsPanel.tsx exceeds 200 LOC limit: extracted `src/components/layout/DocsPanel.tsx` is 204 LOC, exceeding the spec's constraint "No source file in dashboard/src/ exceeds 200 LOC (excluding ui/ primitives)". Needs 4 lines trimmed or extraction of a sub-component. Tested at iter 1. (priority: high)

### In Progress

### Up Next

- [x] **Extract `DocsPanel.tsx`** — Move `DocsPanel`, `DocContent`, `HealthPanel` (lines ~375–567) to `src/components/layout/DocsPanel.tsx` (~194 LOC total, within the 200 LOC spec limit). Export all three. Re-export from AppView.tsx temporarily.

- [ ] **Extract `Sidebar.tsx`** — Move `Sidebar` component (lines ~68–370, ~305 LOC) to `src/components/layout/Sidebar.tsx`. This is large; split out `SessionCard` inner component to reduce the main component. Re-export from AppView.tsx to keep App.tsx re-exports working.

- [ ] **Extract `ActivityPanel` and `LogEntryRow`** — Move `ActivityPanel` (~100 LOC) and `LogEntryRow` (~260 LOC) to `src/components/activity/ActivityPanel.tsx` and `src/components/activity/LogEntryRow.tsx` respectively. Move `ArtifactComparisonDialog` + `ImageLightbox` to `src/components/artifacts/` or `src/components/activity/`. Re-export from AppView.tsx.

- [ ] **Extract custom hooks** — Extract the three major logic blobs from `AppInner()` into dedicated hooks:
  - `src/hooks/useSSE.ts` — SSE connection + state updates (`connectSSE`, `load`, reconnect logic, `connectionStatus`, `qaCoverageRefreshKey`)
  - `src/hooks/useSession.ts` — Session selection, URL sync, session list derivation
  - `src/hooks/useSteering.ts` — `handleSteer`, `handleStop`, `handleResume` with their submitting states
  Each hook must be < 150 LOC.

- [ ] **Create `MainPanel.tsx`** — `src/components/layout/MainPanel.tsx` composing: `<Header>` (imported from layout/Header), activity panel area (ActivityPanel), mobile panel toggle tabs, and `<Footer>` at the bottom. Props: all data the Header and Footer need, plus an `activityPanel` render prop or direct ActivityPanel props.

- [ ] **Create `AppShell.tsx`** — `src/components/layout/AppShell.tsx` using `react-resizable-panels` (already installed, shadcn wrapper at `@/components/ui/resizable`). Three-panel layout: `<Sidebar>` | `<MainPanel>` | `<DocsPanel>`. Handle responsive breakpoints: mobile (stacked/drawer), tablet (2-panel), desktop (3-panel). Keyboard shortcut `Ctrl+B` toggles sidebar.

- [ ] **Reduce `AppView.tsx` to <100 LOC shell** — `AppInner` becomes a thin shell that:
  - Calls `useSSE`, `useSession`, `useSteering`, `useResponsiveLayout`
  - Handles `Ctrl+B`, `Ctrl+K`, `Escape` keyboard shortcuts
  - Renders `<AppShell>` passing all derived props
  - Contains `<CommandPalette>` and `<Toaster>`
  Remove all extracted component definitions. Keep only re-exports for backward compatibility (App.tsx imports).

- [ ] **Split `Header.tsx` to stay within 200 LOC** — `Header.tsx` is 385 LOC which violates the spec constraint. Split sub-components (e.g. `QACoverageBadge`, `PhaseBadge`, `StatusDot`, `ConnectionIndicator`, `ElapsedTimer`) into a separate file such as `src/components/layout/HeaderBadges.tsx`.

- [ ] **Update `App.tsx` re-exports** — Verify all symbols re-exported from App.tsx still resolve after the refactor (Sidebar, ActivityPanel, DocContent, HealthPanel, ArtifactComparisonDialog, all utility functions). Update import paths as needed.

- [ ] **Add/update tests** — Each new file needs a test. At minimum:
  - `DocsPanel.tsx` render test (tabs visible, overflow dropdown, health tab)
  - `Sidebar.tsx` render test
  - `ActivityPanel.tsx` render test
  - `AppShell.tsx` render test (all three panels render)
  - Verify existing tests still pass: `npm run type-check && npm test`

### Completed

- [x] **Extract `Footer.tsx`** — Moved `Footer` component to `src/components/layout/Footer.tsx` (66 LOC). Re-exported from AppView.tsx.

- [x] **Extract `Header.tsx`** — Moved `Header` and related components to `src/components/layout/Header.tsx`. Re-exported from AppView.tsx. (Note: still 385 LOC — split task added to Up Next.)
