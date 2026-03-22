# Sub-Spec: Issue #154 — Extract session and sidebar components from AppView.tsx

## Current state

Extract the session sidebar UI from `AppView.tsx` into dedicated components under `src/components/session/` and `src/components/layout/`.

## Target

### Create `src/components/session/SessionCard.tsx`
- Single session entry showing: session name, status dot, elapsed time, iteration count
- Click handler for selection
- Active state styling

### Create `src/components/session/SessionList.tsx`
- Scrollable list of SessionCard components
- Grouped by project (tree view)
- Active/Older sections with collapsible headers
- Search/filter input

### Create `src/components/session/SessionDetail.tsx`
- Selected session detail view (used in main panel header area)
- Session name, iteration counter, progress bar, phase badge

### Create `src/components/layout/Sidebar.tsx`
- Complete sidebar component wrapping SessionList
- Toggle visibility (`Ctrl+B` keyboard shortcut)
- Resizable panel integration

### Update `AppView.tsx`
- Replace inline `Sidebar()` function and session rendering with imports

## Acceptance Criteria
- [ ] Each component file is <150 LOC
- [ ] Session cards show status dots with correct colors
- [ ] Tree view groups sessions by project
- [ ] Active/Older section headers are collapsible
- [ ] `Ctrl+B` toggles sidebar visibility
- [ ] All existing tests pass
- [ ] `npm run type-check` passes

## Files
- `aloop/cli/dashboard/src/AppView.tsx` (modify)
- `aloop/cli/dashboard/src/components/session/SessionCard.tsx` (create)
- `aloop/cli/dashboard/src/components/session/SessionList.tsx` (create)
- `aloop/cli/dashboard/src/components/session/SessionDetail.tsx` (create)
- `aloop/cli/dashboard/src/components/layout/Sidebar.tsx` (create)

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`
