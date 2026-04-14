# Issue #157: Reduce AppView.tsx to layout shell and create AppShell, MainPanel, DocsPanel

## Objective

Complete the refactor by extracting remaining layout components and reducing `AppView.tsx` to a <100 LOC layout shell that composes all extracted components.

## Scope

### Create `src/components/layout/AppShell.tsx`
- Top-level layout component using `react-resizable-panels`
- Three-panel layout: Sidebar | MainPanel | DocsPanel
- Responsive breakpoints (mobile: stacked, tablet: 2-panel, desktop: 3-panel)

### Create `src/components/layout/MainPanel.tsx`
- Central content area composing:
  - Header bar (session name, iteration counter, progress bar, phase badge, connection indicator)
  - ActivityLog
  - SteerInput (always visible at bottom)
  - Stop/Force buttons

### Create `src/components/layout/DocsPanel.tsx`
- Right-side panel with tabbed interface (TODO, SPEC, etc.)
- Overflow dropdown for extra tabs
- Health tab integration
- Extract from `DocsPanel()` and `DocContent()` in AppView.tsx

### Create `src/components/layout/Header.tsx`
- Header bar component
- Extract from `Header()` in AppView.tsx

### Create `src/components/layout/Footer.tsx`
- Footer bar component
- Extract from `Footer()` in AppView.tsx

### Reduce `AppView.tsx`
- Should become a thin shell (<100 LOC) that:
  - Calls custom hooks (useSSE, useSession, useSteering, useTheme)
  - Renders `<AppShell>` with all panels
  - Handles keyboard shortcuts (`Ctrl+B`, `Ctrl+K`, `Escape`)

### Update `App.tsx`
- Ensure re-exports still work correctly

## Acceptance Criteria
- [ ] `AppView.tsx` is <100 LOC
- [ ] No source file in `dashboard/src/` exceeds 200 LOC (excluding `ui/` primitives)
- [ ] Dashboard renders identically before and after refactor
- [ ] All three panels (sidebar, main, docs) render correctly
- [ ] Keyboard shortcuts work: `Ctrl+B` sidebar, `Ctrl+K` command palette, `Escape` close
- [ ] All existing tests pass
- [ ] `npm run type-check` passes

## Files
- `aloop/cli/dashboard/src/AppView.tsx` (reduce to shell)
- `aloop/cli/dashboard/src/App.tsx` (verify re-exports)
- `aloop/cli/dashboard/src/components/layout/AppShell.tsx` (create)
- `aloop/cli/dashboard/src/components/layout/MainPanel.tsx` (create)
- `aloop/cli/dashboard/src/components/layout/DocsPanel.tsx` (create)
- `aloop/cli/dashboard/src/components/layout/Header.tsx` (create)
- `aloop/cli/dashboard/src/components/layout/Footer.tsx` (create)

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`
