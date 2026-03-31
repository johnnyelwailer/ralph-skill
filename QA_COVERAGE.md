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
| Unit test suite | 2026-03-31 | 6e97217 | PASS | 158 tests pass (21 test files) |
| TypeScript type-check | 2026-03-31 | 6e97217 | PASS | tsc --noEmit clean |
| Swipe gesture to open sidebar | 2026-03-31 | 6e97217 | FAIL | Spec body requires "swipe right from left edge opens sidebar" — not implemented; not in acceptance criteria (P3) |
