# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| No horizontal scroll at 320px | 2026-03-31 | 6e97217 | PASS | Verified via Playwright, bodyScrollWidth === windowWidth |
| Sidebar collapses to hamburger < 640px | 2026-03-31 | 6e97217 | PASS | `hidden sm:flex` desktop sidebar; `Toggle sidebar` btn present on mobile |
| Steer input accessible at all breakpoints | 2026-03-31 | 6e97217 | PASS | Textarea visible at 320px, 375px, 768px, 1920px |
| Tap targets ≥ 44px on mobile | 2026-03-31 | 6e97217 | PASS | 0 small buttons at 320px and 375px; `min-h-[44px] min-w-[44px]` classes verified |
| Session list scroll on 375px | 2026-03-31 | 6e97217 | PASS | ScrollArea component present in mobile drawer |
| Ctrl+B sidebar toggle at tablet | 2026-03-31 | 6e97217 | PASS | Collapse sidebar button visible after Ctrl+B on 768px viewport |
| Desktop layout unchanged | 2026-03-31 | 6e97217 | PASS | 2-column layout (sidebar 256px + main 1184px) at 1440px; no regression |
| No hover-only interactions | 2026-03-31 | 6e97217 | PASS | HoverCard tap-toggle unit tested; 158 unit tests all pass |
| Unit test suite | 2026-03-31 | bcbff3f | PASS | 158 tests pass (21 test files); Gate 2 imgBtn assertion now enforced (no longer vacuous) |
| TypeScript type-check | 2026-03-31 | bcbff3f | PASS | tsc --noEmit clean; Gate 4 dead import removal verified no type errors |
| Tap targets ≥ 44px on mobile | 2026-03-31 | bcbff3f | PASS | 0 small buttons at 320px and 390px post Gate 2/4 fixes; no regression |
| No horizontal scroll at 320px | 2026-03-31 | bcbff3f | PASS | bodyScrollWidth === windowWidth (320) at 320x568 |
| Swipe gesture to open sidebar | 2026-03-31 | 6e97217 | FAIL | Spec body requires "swipe right from left edge opens sidebar" — not implemented; not in acceptance criteria (P3) |
| E2E smoke: tap target menuitem visibility | 2026-03-31 | bcbff3f | FAIL | `npx playwright test e2e/smoke.spec.ts:162` — Stop after iteration menuitem not found; pre-existing failure (same at 6e97217); product tap targets PASS via custom Playwright at 390px |
| Unit test suite | 2026-03-31 | 0fd8078 | PASS | 158 tests pass (21 test files); re-verified at final-qa commit — no regression |
| TypeScript type-check | 2026-03-31 | 0fd8078 | PASS | tsc --noEmit clean; build succeeds (464KB bundle) |
| No horizontal scroll at 320px | 2026-03-31 | 0fd8078 | PASS | bodyScrollWidth ≤ windowWidth at 320×568 and 375×667 |
| Hamburger present on mobile | 2026-03-31 | 0fd8078 | PASS | aria-label*="sidebar" button found at 320px and 375px |
| Steer input visible on mobile | 2026-03-31 | 0fd8078 | PASS | Textarea visible at 320×568 and 375×667 |
| Tap targets ≥ 44px on mobile | 2026-03-31 | 0fd8078 | PASS | 0 small buttons at 320×568 and 375×667 |
| Desktop two-column layout | 2026-03-31 | 0fd8078 | PASS | Sidebar present at 1440×900 |
| Unit test suite | 2026-03-31 | 8f07f511 | PASS | 158 tests pass (21 test files); no regression post docs-only commits |
| TypeScript type-check | 2026-03-31 | 8f07f511 | PASS | tsc --noEmit clean; 464KB bundle |
| No horizontal scroll at 320px | 2026-03-31 | 8f07f511 | PASS | bodyScrollWidth === windowWidth at 320×568 |
| Hamburger present on mobile | 2026-03-31 | 8f07f511 | PASS | aria-label*="sidebar" button found at 375px |
| Steer input visible on mobile | 2026-03-31 | 8f07f511 | PASS | Textarea visible at 320×568 |
| Tap targets ≥ 44px on mobile | 2026-03-31 | 8f07f511 | PASS | 0 buttons < 44px at 375×667 |
| Desktop two-column layout | 2026-03-31 | 8f07f511 | PASS | Page content present at 1440×900 |
| Unit test suite | 2026-03-31 | 804b347c | PASS | 158 tests pass (21 test files); no regression post docs-only commits |
| TypeScript type-check | 2026-03-31 | 804b347c | PASS | tsc --noEmit clean; 464KB bundle built |
| Unit test suite | 2026-03-31 | 1b2603f | PASS | 158 tests pass (21 test files); no regression post E2E fixture refresh + OpenCode docs commits |
| TypeScript type-check | 2026-03-31 | 1b2603f | PASS | tsc --noEmit clean; no regression |
