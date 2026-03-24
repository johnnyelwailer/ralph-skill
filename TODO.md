# Issue #112: Responsive layout: breakpoint hooks & mobile sidebar collapse

## Current Phase: Fix / Proof

### Bugs & Review Fixes (Must Fix Before Done)

- [x] [review/Gate 1 + qa/P1] Hide "Collapse sidebar" button at desktop breakpoint: `Sidebar` component (AppView.tsx:722) needs an `isDesktop` prop; the `<button aria-label="Collapse sidebar">` at line 938-940 should render only when `!isDesktop`. At desktop, sidebar is always-visible per spec, so the collapse affordance is misleading and `onToggle=toggleSidebar` is intentionally a no-op. Fix: add `isDesktop: boolean` to `Sidebar` props, pass `isDesktop` from the call site at AppView.tsx:2466, and guard the button with `{!isDesktop && <Tooltip>...</Tooltip>}`. This resolves both the review finding and the qa/P1 Ctrl+B "no effect" report. (priority: high)

- [ ] [review/Gate 6] Generate proof screenshots for UI-touching build iterations: Run proof agent to capture Playwright screenshots at mobile (390×844), tablet (768×1024), and desktop (1280×800) viewports demonstrating (a) hamburger menu visible on mobile, (b) sidebar drawer open on mobile, (c) swipe gesture opens sidebar, (d) desktop layout unchanged. Produce `proof-manifest.json` at repo root with `artifacts` array referencing each screenshot. The existing proof-manifest.json covers only iteration 1 at mobile; iters 2 (useBreakpoint hook), 5 (ResponsiveLayout wrapper), and 11 (TS fixes + swipe) need coverage. (priority: high)

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
