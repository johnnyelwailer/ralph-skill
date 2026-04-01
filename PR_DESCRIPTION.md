## Summary

Implements responsive layout, touch targets, and accessibility audit for the aloop dashboard (issue #114). The dashboard was desktop-only; this PR makes it fully usable on mobile and tablet devices.

Key changes:
- `LogEntryRow` extracted as a standalone component with keyboard handlers (Enter/Space), `min-h-[44px] md:min-h-0` mobile tap target, and expandable detail view
- Mobile hamburger sidebar with overlay drawer at <1024px; desktop sidebar persistent at ≥1024px
- All interactive elements have `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` classes on mobile
- HoverCard has tap-toggle equivalent for touch devices via `useIsTouchDevice`
- Circular dependency resolved: `ArtifactComparisonDialog`, `ElapsedTimer`, `findBaselineIterations` moved from AppView to their own files
- Utility modules extracted from AppView into `lib/` (ansi.ts, format.ts, log.ts, providerHealth.ts, types.ts)
- SessionCard, StatusDot, PhaseBadge extracted from AppView with long-press context menu
- Swipe-right gesture to open sidebar on mobile (`AppView.tsx:1009-1028`)

## Files Changed

- `aloop/cli/dashboard/src/components/LogEntryRow.tsx` — new standalone component with a11y + tap targets
- `aloop/cli/dashboard/src/components/LogEntryRow.accessibility.test.tsx` — 11 a11y tests (keyboard, tap targets, lightbox close)
- `aloop/cli/dashboard/src/components/artifacts/ArtifactComparisonDialog.tsx` — extracted from AppView; close button has mobile tap target
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/components/session/SessionCard.tsx` — extracted from AppView; long-press context menu
- `aloop/cli/dashboard/src/components/shared/StatusDot.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.tsx` — extracted from AppView
- `aloop/cli/dashboard/src/lib/ansi.ts`, `format.ts`, `log.ts`, `providerHealth.ts`, `types.ts` — extracted utilities
- `aloop/cli/dashboard/src/AppView.tsx` — mobile hamburger (`lg:hidden`), desktop sidebar (`hidden lg:flex`), responsive layout, swipe gesture, aria-labels on close buttons
- `aloop/cli/dashboard/e2e/smoke.spec.ts` — Playwright bounding box checks for tap targets at 375×667 and 390×844
- `aloop/cli/dashboard/e2e/proof.spec.ts` — 5 layout tests: mobile hamburger/drawer/swipe, tablet 768×1024, desktop 1280×800
- `docs/conventions/FRONTEND.md` — updated to reflect SSE/EventSource, actual file structure, hooks/, tap target accessibility conventions; clarifies react-resizable-panels wrapper exists but layout uses CSS flex; documents `parseTodoProgress` cross-module import from CLI shared lib (`../../src/lib/parseTodoProgress`)
- `README.md` — documents responsive mobile layout, corrects CLI flags, adds OpenCode limitation note, corrects auth failure behavior (degraded/no-auto-retry), corrects OpenCode autonomous flag (`run --dir <workdir>` → `run`), adds STEERING.md to document viewer list, documents command palette (Cmd+K)

## Verification

- [x] Dashboard renders without horizontal scroll at 320px (AC1) — `overflow-hidden` + `min-w-0` on flex children; QA_COVERAGE verified at 320/375/768/1920px
- [x] Sidebar collapses to hamburger menu below 640px (AC2) — `hidden lg:flex` desktop sidebar; `lg:hidden` hamburger + mobile overlay drawer; hamburger present at all widths <1024px
- [x] Steer input accessible at all breakpoints (AC3) — footer `shrink-0` always visible at bottom of `h-screen` flex container; QA_COVERAGE at 320/375/768/1920px
- [x] All tap targets ≥ 44×44px on mobile (AC4) — `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` on LogEntryRow, comparison tabs, close buttons; 0 small buttons at 320/375px; verified by smoke.spec.ts bounding box at 390×844
- [x] Session list scrollable at 375px viewport (AC5) — `<ScrollArea flex-1>` + mobile drawer `max-w-[80vw]`
- [x] Ctrl+B / hamburger toggle at tablet (AC6) — hamburger `lg:hidden` visible at 640–1023px; desktop sidebar `hidden lg:flex` hidden at tablet; bounding-box verified at 768×1024 via proof.spec.ts + QA_LOG (2026-04-01)
- [x] Desktop layout unchanged (AC7) — desktop sidebar at ≥1024px; 2-column layout confirmed at 1440px; QA_COVERAGE verified
- [x] No hover-only interactions (AC8) — HoverCard tap-toggle tested in `hover-card.test.tsx`; Tooltip tap support; 158 unit tests
- [x] Lighthouse mobile a11y score ≥ 90 (AC9) — **94/100** verified (Lighthouse v13.0.3, Chrome headless, 2026-04-01); see QA_LOG.md

## Proof Artifacts

- Screenshots: `proof-artifacts/tablet-768x1024-layout.png`, `proof-artifacts/mobile-390x844-hamburger.png`, `proof-artifacts/mobile-390x844-sidebar-open.png`, `proof-artifacts/mobile-390x844-swipe-open.png`, `proof-artifacts/desktop-1280x800-layout.png`
- Playwright e2e: `proof.spec.ts` 5/5 PASS (mobile hamburger, drawer, swipe, tablet, desktop)
- Playwright bounding box assertions: `smoke.spec.ts:162-183` (tap targets at 390×844, layout at 1920×1080 and 375×667)
- 158 vitest unit tests pass (21 test files)
- `tsc --noEmit` clean; Vite build 464kB
- Lighthouse mobile accessibility: 94/100 (QA_LOG.md 2026-04-01)
