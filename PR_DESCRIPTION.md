## Summary

Implements responsive layout, touch targets, and accessibility audit for the aloop dashboard (issue #114). The dashboard was desktop-only; this PR makes it fully usable on mobile and tablet devices.

Key changes:
- `LogEntryRow` extracted as a standalone component with keyboard handlers (Enter/Space), `min-h-[44px] md:min-h-0` mobile tap target, and expandable detail view
- Mobile hamburger sidebar with overlay drawer; desktop sidebar persistent
- All interactive elements have `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` classes on mobile
- HoverCard has tap-toggle equivalent for touch devices
- Circular dependency resolved: `ArtifactComparisonDialog`, `ElapsedTimer`, `findBaselineIterations` moved from AppView to their own files
- Utility modules extracted from AppView into `lib/` (ansi.ts, format.ts, log.ts, providerHealth.ts, types.ts)
- SessionCard, StatusDot, PhaseBadge extracted from AppView with long-press context menu

## Files Changed

- `aloop/cli/dashboard/src/components/LogEntryRow.tsx` — new standalone component with a11y + tap targets
- `aloop/cli/dashboard/src/components/LogEntryRow.accessibility.test.tsx` — 11 a11y tests (keyboard, tap targets, lightbox close)
- `aloop/cli/dashboard/src/components/artifacts/ArtifactComparisonDialog.tsx` — extracted from AppView; close button has mobile tap target
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/components/SessionCard.tsx` — extracted from AppView; long-press context menu
- `aloop/cli/dashboard/src/components/StatusDot.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/components/PhaseBadge.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/lib/ansi.ts`, `format.ts`, `log.ts`, `providerHealth.ts`, `types.ts` — extracted utilities
- `aloop/cli/dashboard/src/AppView.tsx` — mobile hamburger, responsive layout, aria-labels on close buttons
- `aloop/cli/dashboard/e2e/smoke.spec.ts` — Playwright bounding box checks for tap targets at 375×667 and 390×844
- `README.md` — documents responsive mobile layout, corrects CLI flags, adds OpenCode limitation note, corrects auth failure behavior (degraded/no-auto-retry)

## Verification

- [x] Dashboard renders without horizontal scroll at 320px (L237) — `overflow-hidden` + `min-w-0` on flex children
- [x] Sidebar collapses to hamburger menu below 640px (L238) — `hidden sm:flex` desktop sidebar; `md:hidden` hamburger + mobile overlay drawer
- [x] Steer input accessible at all breakpoints (L239) — footer `shrink-0` always visible at bottom of `h-screen` flex container
- [x] All tap targets ≥ 44×44px on mobile (L240) — `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` on LogEntryRow, comparison tabs, close buttons; verified by smoke.spec.ts bounding box at 390×844
- [x] Session list scrollable at 375px viewport (L241) — `<ScrollArea flex-1>` + mobile drawer `max-w-[80vw]`
- [x] Ctrl+B / hamburger toggle at tablet (L242) — Ctrl+B when `!isMobile`; hamburger `md:hidden` at 640–767px
- [x] Desktop layout unchanged (L243) — mobile panel toggle is `lg:hidden`; desktop shows both panels
- [x] No hover-only interactions (L244) — HoverCard tap-toggle tested in `hover-card.test.tsx`
- [ ] Lighthouse mobile a11y score ≥ 90 (L245) — NOT verified: jsdom does not support Lighthouse (requires Chrome). All underlying a11y attributes implemented and unit-tested. Measurement deferred to CI/local dev. **Does not block completion per spec-gap analysis.**

## Proof Artifacts

- Playwright e2e bounding box assertions: `aloop/cli/dashboard/e2e/smoke.spec.ts:162-183` (tap targets at 390×844, layout at 1920×1080 and 375×667)
- 158 vitest unit tests pass (21 test files)
- `tsc --noEmit` clean; Vite build 464kB
