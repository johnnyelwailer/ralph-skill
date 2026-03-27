# Issue #113: Responsive layout: mobile content panels, fixed steer input & tablet two-column

## Tasks

### Up Next

- [x] Fix steer input: `position: fixed` at viewport bottom on mobile with safe-area inset (priority: high)
  - Footer currently uses `shrink-0` inline in flex column — not fixed on mobile
  - Add `sm:relative sm:border-t` + `fixed bottom-0 inset-x-0 z-30 border-t` on mobile
  - Add `pb-[footer-height]` padding to `<main>` on mobile so content isn't hidden behind fixed footer
  - Use `env(safe-area-inset-bottom)` via `pb-[calc(...+env(safe-area-inset-bottom))]` for notch support

- [x] Docs panel tabs: collapse to dropdown selector on mobile instead of horizontal scroll (priority: high)
  - Currently `TabsList` uses `overflow-x-auto` + `flex-nowrap` which scrolls horizontally on mobile
  - On mobile (`< sm`) render a `<select>` or `DropdownMenu` showing active tab name + chevron
  - At `sm:` and above keep the existing horizontal tab row
  - Can be done with conditional rendering inside `DocsPanel` using a Tailwind `sm:hidden` / `hidden sm:flex` split

- [x] [qa/P1] `sidebarCollapsed` ReferenceError crashes AppInner: `AppView.tsx` was refactored to use `useResponsiveLayout()` (provides `sidebarOpen`, `toggleSidebar`, `openSidebar`) but lines 2509 and 2523 still reference undefined `sidebarCollapsed`/`setSidebarCollapsed` → `ReferenceError` at runtime, 7 integration tests fail. Fix: replace `sidebarCollapsed` with `!sidebarOpen` and `setSidebarCollapsed(false)` with `openSidebar()`, `setSidebarCollapsed(!sidebarCollapsed)` with `toggleSidebar()`. Tested at iter 5. (priority: high)

- [ ] Command palette: full-screen overlay on mobile (priority: medium)
  - Currently `pt-[20vh]` + `max-w-md` inner div is not full-screen on small viewports
  - On mobile: remove top offset and `max-w-md`, fill full viewport (`inset-0`, no padding, `rounded-none`)
  - At `sm:` keep existing centered dialog style

- [ ] Provider health: expandable section in main view on mobile (priority: medium)
  - Currently only accessible as a tab inside `DocsPanel` (Health tab)
  - On mobile, add a `<Collapsible>` section between `<main>` panels and `<Footer>` (or above docs panel) showing `HealthPanel`
  - At `sm:` and above, hide this section (it's already accessible via the Health tab in DocsPanel)

### Completed

- [x] Responsive layout: panels stack vertically on mobile, side-by-side at tablet/desktop (`flex-col` → `sm:flex-row` / `lg:flex-row`)
- [x] Mobile hamburger menu: sidebar collapses to drawer overlay on mobile (`hidden md:flex` sidebar + `mobileMenuOpen` drawer)
- [x] 44px minimum tap targets on mobile (`min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`)
- [x] Tablet two-column when sidebar hidden: `${sidebarCollapsed ? 'sm:flex-row' : ''}` handles this
- [x] Tablet stacks vertically when sidebar visible: no `sm:flex-row` when sidebarCollapsed is false
- [x] Overflow docs tabs: extra tabs handled via DropdownMenu `MoreHorizontal` button
