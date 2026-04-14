# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Current Status

`AppView.tsx` is 1393 LOC. The following components still need extraction:
- `Sidebar` (~305 LOC)
- `ActivityPanel` + `LogEntryRow` (~360 LOC combined)
- `ArtifactComparisonDialog` + `ImageLightbox` (~220 LOC combined)
- `CommandPalette` (~40 LOC)
- `AppInner` state/SSE logic (~380 LOC)

Already extracted (with issues): `Header.tsx` (385 LOC — exceeds 200 LOC limit), `DocsPanel.tsx` (199 LOC — OK), `Footer.tsx` (66 LOC — OK).

## Tasks

### In Progress

- [x] [review] Gate 3: **`log-session.ts` coverage gaps** — No dedicated test file for `log-session.ts` exists. Four branches are untested: (1) `latestQaCoverageRefreshSignal('')` → `null` early return; (2) log with malformed JSON lines should skip (catch branch); (3) `iteration_complete` with `phase: 'build'` (non-QA) should return `null`; (4) `toSession({ project_root: '/home/user/my-project' }, 'fallback', true)` should set `projectName === 'my-project'`. Create `src/lib/__tests__/log-session.test.ts` (or equivalent path) importing directly from `lib/log-session`. All four branches must be covered. (priority: high)

- [ ] [review] Gate 7: **Playwright/browser verification** — No browser verification performed after extracting Header, Footer, DocsPanel layout components. Spec acceptance criterion: "Dashboard renders identically before and after refactor." Run `npm run test:e2e` (Playwright) against the dashboard dev server and confirm panels render correctly (Header at top, Footer at bottom, DocsPanel tabs visible). Gate 7 is a mandatory fail without browser verification for layout changes. (priority: high)

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

- [x] **Extract `DocsPanel.tsx`** — Moved `DocsPanel`, `DocContent`, `HealthPanel` to `src/components/layout/DocsPanel.tsx`. Re-exported from AppView.tsx. (Note: 204 LOC at extraction — trimmed to 199 LOC in subsequent commits.)

- [x] **Fix type-check errors** — All 5 type errors resolved; `tsc --noEmit` exits clean.

- [x] **Fix 3 failing tests in App.coverage.test.ts** — All 243 tests pass.

- [x] [review] Gate 3: **DocsPanel.tsx branch coverage** — Added 8 tests covering `DocContent` wide mode (SPEC and non-SPEC files), `HealthPanel` cooldown (future/past timestamp), failed, and unknown status. All 15 DocsPanel tests pass; ≥90% branch coverage achieved.

- [x] [qa/P1] **Fix duplicate cooldown IIFE in `DocsPanel.tsx`** — Extracted `remainingSecs` variable before JSX return. IIFE no longer appears twice.

- [x] [qa/P1] **Trim DocsPanel.tsx to ≤200 LOC** — `DocsPanel.tsx` is now 199 LOC (previously 204 LOC).

- [x] [review] Gate 4: **Split `lib/log.ts` to ≤200 LOC** — `lib/log.ts` was 381 LOC. Split into `log-types.ts` (101 LOC), `log-parse.ts` (172 LOC), and `log-session.ts` (110 LOC). `log.ts` is now a 3-LOC re-export barrel. All files within limits.

- [x] [review] Gate 4: **Restore SPEC.md** — Confirmed restored to full 4086-line project spec.
