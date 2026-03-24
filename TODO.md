# Project TODO

## Current Phase: Responsive Layout Fixes (Issue #112)

### In Progress

### Up Next

### Spec-Gap Analysis

- [ ] [spec-gap/P2] No hamburger toggle visible at tablet breakpoint: SPEC-ADDENDUM.md line 214 says "Tablet (640–1024px): sidebar collapsible, toggled via Ctrl+B / **hamburger**". Acceptance criterion (line 242): "Ctrl+B / hamburger toggle works at tablet breakpoint". The hamburger button in AppView.tsx:1060 has `sm:hidden` which hides it at ≥640px (tablet + desktop). At tablet breakpoint, only Ctrl+B works — no visible affordance for touch/mouse users who don't know the keyboard shortcut. Fix options: (a) change `sm:hidden` → `lg:hidden` so the hamburger is visible on mobile + tablet; or (b) update spec to accept Ctrl+B-only at tablet. Files: AppView.tsx:1060 (`sm:hidden`), SPEC-ADDENDUM.md:214,242.

### Completed
- [x] Restrict Ctrl+B to non-mobile: skip `toggleSidebar` in the keydown handler when `isMobile` is true (priority: low, P3)
- [x] Fix tablet sidebar hidden-by-default: changed `hidden sm:flex` to `hidden lg:flex` so desktop sidebar only shows at lg+ (1024px+); tablet uses overlay drawer
- [x] Fix test infrastructure: added window.matchMedia stub + innerWidth simulation in test-setup.ts; updated integration tests to simulate tablet viewport (800px) for sidebar toggle coverage
- [x] Install dashboard node_modules (npm install in aloop/cli and aloop/cli/dashboard)
- [x] useBreakpoint hook with matchMedia listeners and SSR safety (src/hooks/useBreakpoint.ts)
- [x] ResponsiveLayout context wrapper with full sidebar state machine (src/hooks/useResponsiveLayout.ts)
- [x] Tests for useBreakpoint and useResponsiveLayout
- [x] AppView integration: ResponsiveLayout wrapper, swipe gesture, keyboard shortcuts, mobile overlay drawer
- [x] Collapse button hidden on desktop (via `d28764bd`)
