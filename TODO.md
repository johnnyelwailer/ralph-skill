# Issue #112: Responsive layout: breakpoint hooks & mobile sidebar collapse

## Current Phase: QA / Build

### Bugs (Must Fix Before Done)

- [ ] [qa/P1] Ctrl+B sidebar toggle has no runtime effect: Pressed Ctrl+B at desktop (1280px) and tablet (768px) → sidebar wrapper class stays `hidden sm:flex`, sidebar offsetWidth stays 256px, no visual change. Clicking the "Collapse sidebar" button in the sidebar header also has no visible effect. Root cause likely: keyboard handler in AppView.tsx still calls old `setSidebarCollapsed` / `setMobileMenuOpen` state setters instead of `toggleSidebar` from ResponsiveLayout context (which now owns sidebar state). Spec AC says "Ctrl+B continues to toggle sidebar (no regression)". Tested at iter 12. (priority: high)

### Review Tasks (Fix Before Done)

- [ ] [review] Gate 1: "Collapse sidebar" button (PanelLeftClose, AppView.tsx:938-939) is always rendered when sidebar is non-collapsed. At desktop (isDesktop=true), the sidebar is always collapsed=false, so this button always shows. But onToggle=toggleSidebar is a no-op at desktop (ResponsiveLayout.tsx:50-53 returns early if isDesktop). Root cause of QA P1 bug is NOT stale state setters (code does call toggleSidebar from context) — it IS that toggleSidebar is by design a no-op at desktop. Fix: either (a) hide the Collapse button at desktop breakpoint (sidebar always-visible per spec, button is misleading), or (b) make ResponsiveLayout allow desktop collapse. Option (a) is correct per spec. (priority: high)
- [ ] [review] Gate 6: No proof-manifest.json files found for any build iteration (iter-2 useBreakpoint hook, iter-5 ResponsiveLayout wrapper, iter-11 TS fixes + swipe gesture). Artifacts contain only output.txt agent logs — not valid proof. All three iterations made observable UI changes (sidebar drawer animation, hamburger menu, swipe gesture, responsive breakpoint classes). Proof agent must run and generate structured proof-manifest.json with screenshots or Playwright recordings for each UI-touching build iteration. (priority: high)

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
