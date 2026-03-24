# Issue #112: Responsive layout: breakpoint hooks & mobile sidebar collapse

## Current Phase: Fix / Proof

### Bugs & Review Fixes (Must Fix Before Done)

- [x] [review/Gate 1 + qa/P1] Hide "Collapse sidebar" button at desktop breakpoint: `Sidebar` component (AppView.tsx:722) needs an `isDesktop` prop; the `<button aria-label="Collapse sidebar">` at line 938-940 should render only when `!isDesktop`. At desktop, sidebar is always-visible per spec, so the collapse affordance is misleading and `onToggle=toggleSidebar` is intentionally a no-op. Fix: add `isDesktop: boolean` to `Sidebar` props, pass `isDesktop` from the call site at AppView.tsx:2466, and guard the button with `{!isDesktop && <Tooltip>...</Tooltip>}`. This resolves both the review finding and the qa/P1 Ctrl+B "no effect" report. (priority: high)

- [x] [review/Gate 6] Generate proof screenshots for UI-touching build iterations: Playwright screenshots captured at mobile (390×844), tablet (768×1024), and desktop (1280×800) viewports demonstrating hamburger visibility, sidebar drawer open, swipe gesture, and desktop layout. `proof-manifest.json` updated with artifacts referencing iterations 1, 2, 5, 11, and 15.

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
- [x] Playwright proof tests — 5 tests covering mobile hamburger, sidebar drawer, swipe gesture, tablet layout, desktop layout
- [x] proof-manifest.json updated with 6 artifacts across iterations 1–15
