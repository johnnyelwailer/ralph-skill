## Summary

Implements responsive layout for the aloop dashboard (Issue #113), enabling monitoring and steering from mobile devices and tablets. The dashboard was previously desktop-only; this PR adds mobile-first layout with a stacked-panel design, a hamburger sidebar drawer, a fixed steer footer on mobile, docs panel tab dropdown on mobile, and a full-screen command palette overlay on mobile. Also fixes a dead swipe gesture (handlers were defined but never attached) and removes dead code.

## Files Changed

- `aloop/cli/dashboard/src/AppView.tsx` — responsive layout implementation: flex-col → sm:flex-row panels, mobile hamburger drawer (`mobileMenuOpen`), fixed footer on mobile (`fixed bottom-0`), docs tab dropdown (`sm:hidden` trigger), full-screen command palette, swipe gesture handlers, isDesktop prop on Sidebar
- `aloop/cli/dashboard/e2e/smoke.spec.ts` — updated mobile layout tests to reflect always-visible stacked panels; removed stale toggle-button assertions; retained and extended 44px tap-target checks
- `aloop/cli/dashboard/e2e/proof.spec.ts` — new E2E proof tests: desktop Collapse button hidden, swipe gesture opens sidebar, hamburger opens drawer, tablet layout, mobile stacked layout

## Verification

- [x] Sidebar collapses to hamburger menu below 640px — verified by `smoke.spec.ts:135` (aside not visible at 375px) and `proof.spec.ts` hamburger test
- [x] Steer input is accessible (visible or one tap away) at all breakpoints — footer is `fixed bottom-0 inset-x-0` on mobile with `env(safe-area-inset-bottom)` padding; inline on tablet/desktop
- [x] All tap targets are at least 44x44px on mobile viewports — verified by `smoke.spec.ts:147` bounding-box assertions for Toggle sidebar, Steer textarea, Send button, Stop menu button
- [x] Swipe right from left edge opens sidebar on mobile — verified by `proof.spec.ts:103` dispatching real touch events
- [x] Desktop layout is unchanged from the current spec — verified by `proof.spec.ts` desktop screenshot and `smoke.spec.ts` 1920×1080 three-column bounding-box test
- [x] `Ctrl+B` / hamburger toggle works at tablet breakpoint — hamburger toggle tested at multiple viewports; Ctrl+B keyboard handler pre-existing
- [x] No hover-only interactions — all new interactive elements have click/tap equivalents
- [x] Session list is scrollable and usable on a 375px-wide viewport — sidebar drawer tested via hamburger open; session items accessible within drawer
- [ ] Dashboard renders without horizontal scroll at 320px viewport width — NOT verified: smoke tests use 375px minimum; 320px was not explicitly tested
- [ ] Lighthouse mobile accessibility score >= 90 — NOT verified: Lighthouse not run in CI for this iteration

## Proof Artifacts

- Screenshot: `proof-artifacts/desktop-1280x800-layout.png`
- Screenshot: `proof-artifacts/mobile-390x844-hamburger.png`
- Screenshot: `proof-artifacts/mobile-390x844-sidebar-open.png`
- Screenshot: `proof-artifacts/mobile-390x844-swipe-open.png`
- Screenshot: `proof-artifacts/tablet-768x1024-layout.png`
- Test output: 11/11 E2E tests pass, 148/148 unit tests pass (see QA_LOG.md iter 27)
