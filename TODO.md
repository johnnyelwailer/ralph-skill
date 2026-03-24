# Issue #112: Responsive layout: breakpoint hooks & mobile sidebar collapse

## Current Phase: QA / Build

### Bugs (Must Fix Before Done)

- [ ] [qa/P1] Ctrl+B sidebar toggle has no runtime effect: Pressed Ctrl+B at desktop (1280px) and tablet (768px) → sidebar wrapper class stays `hidden sm:flex`, sidebar offsetWidth stays 256px, no visual change. Clicking the "Collapse sidebar" button in the sidebar header also has no visible effect. Root cause likely: keyboard handler in AppView.tsx still calls old `setSidebarCollapsed` / `setMobileMenuOpen` state setters instead of `toggleSidebar` from ResponsiveLayout context (which now owns sidebar state). Spec AC says "Ctrl+B continues to toggle sidebar (no regression)". Tested at iter 12. (priority: high)

### Completed

- [x] Create `useBreakpoint.ts` hook — returns `'mobile' | 'tablet' | 'desktop'` with 640/1024px breakpoints, SSR-safe, matchMedia listeners
- [x] Create `useBreakpoint.test.ts` — all three breakpoint values tested, listener cleanup verified
- [x] Create `ResponsiveLayout.tsx` — context wrapper providing `BreakpointContext` via `useBreakpointContext()`
- [x] CSS breakpoint correction — changed `md:hidden`/`hidden md:flex` to `sm:hidden`/`hidden sm:flex` for sidebar boundary (hamburger now visible at < 640px not < 768px)
- [x] Wrap AppView with `<ResponsiveLayout>` to provide context
- [x] Add swipe-right gesture — touch from ≤20px left edge, ≥50px travel → opens mobile sidebar; only on mobile breakpoint; no-op on tablet/desktop
- [x] 320px no horizontal scroll
- [x] 375px no horizontal scroll
- [x] Hamburger tap target 44×44px
- [x] Mobile sidebar overlay (hamburger tap opens drawer + backdrop)
- [x] TypeScript clean (tsc --noEmit)
- [x] All 147 unit tests pass
