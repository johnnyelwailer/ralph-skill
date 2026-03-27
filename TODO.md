# Issue #113: Responsive layout: mobile content panels, fixed steer input & tablet two-column

## Tasks

### In Progress

- [x] Provider health: expandable section in main view on mobile (priority: medium)
  - Currently only accessible as a tab inside `DocsPanel` (Health tab at AppView.tsx:1363)
  - `HealthPanel` is defined at AppView.tsx:1439–1482; `providerHealth` data available at AppView.tsx:2405
  - `Collapsible` component already imported at AppView.tsx:13
  - On mobile: add a `<Collapsible className="sm:hidden">` section **between `</main>` (line 2527) and `<Footer>` (line 2528)** in AppView.tsx
  - Trigger: Heart icon + "Provider Health" label + ChevronDown (both already imported)
  - Content: `<HealthPanel providers={providerHealth} />`
  - At `sm:` and above: hide this section (Health is accessible via DocsPanel Health tab)
  - Add height to mobile `<main>` bottom padding to account for collapsed trigger height (~44px)

### Up Next

_(all prior tasks completed)_

### Completed

- [x] [review] Gate 5: `smoke.spec.ts:135` and `smoke.spec.ts:154` reference removed panel toggle buttons ('Documents', 'Activity') that no longer exist — both tests fail. Update these tests to match the new always-visible stacked-panel layout: remove assertions on toggle buttons, assert that both panels are visible simultaneously on mobile, and remove the 44px tap-target assertions for the removed toggles. (priority: high)
- [x] [review] Gate 4: `mobileSidebarRef` (AppView.tsx:2199) is declared with `useRef<HTMLDivElement>(null)` and attached to the mobile drawer div, but the ref value is never read anywhere — dead code. Remove the ref declaration and the `ref={mobileSidebarRef}` prop from AppView.tsx:2515. (priority: low)
- [x] Fix steer input: `position: fixed` at viewport bottom on mobile with safe-area inset (priority: high)
- [x] Docs panel tabs: collapse to dropdown selector on mobile instead of horizontal scroll (priority: high)
- [x] [qa/P1] `sidebarCollapsed` ReferenceError crashes AppInner (priority: high)
- [x] Command palette: full-screen overlay on mobile (priority: medium)
- [x] [review] Gate 5: `proof.spec.ts:149` FAIL — desktop Sidebar missing `isDesktop={isDesktop}` prop at AppView.tsx:2509. Fixed.
- [x] [review] Gate 4/5: `handleTouchStart`/`handleTouchEnd` were defined but never attached — swipe-right-to-open gesture was broken. Fixed.
- [x] Responsive layout: panels stack vertically on mobile, side-by-side at tablet/desktop (`flex-col` → `sm:flex-row` / `lg:flex-row`)
- [x] Mobile hamburger menu: sidebar collapses to drawer overlay on mobile (`hidden md:flex` sidebar + `mobileMenuOpen` drawer)
- [x] 44px minimum tap targets on mobile (`min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`)
- [x] Tablet two-column when sidebar hidden: `${sidebarCollapsed ? 'sm:flex-row' : ''}` handles this
- [x] Tablet stacks vertically when sidebar visible: no `sm:flex-row` when sidebarCollapsed is false
- [x] Overflow docs tabs: extra tabs handled via DropdownMenu `MoreHorizontal` button

[reviewed: gates 1-9 pass — all prior findings resolved; 11 E2E + 148 unit tests green]
