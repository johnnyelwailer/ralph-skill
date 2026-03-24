# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| useBreakpoint hook (unit) | 2026-03-24 | 98f27d27 | PASS | All 3 breakpoint values, listener cleanup — 147 tests pass |
| TypeScript compilation | 2026-03-24 | 98f27d27 | PASS | tsc --noEmit clean |
| Dashboard build | 2026-03-24 | 98f27d27 | PASS | vite build succeeds, no errors |
| Hamburger visible at <640px | 2026-03-24 | 98f27d27 | PASS | sm: breakpoint correction confirmed at 375px and 639px |
| Hamburger hidden at >=640px | 2026-03-24 | 98f27d27 | PASS | Not visible at 641px, 768px, 1280px |
| Desktop sidebar visible >=640px | 2026-03-24 | 98f27d27 | PASS | Sidebar present at 641px, 768px, 1280px, 1920px |
| No horizontal scroll at 375px | 2026-03-24 | 98f27d27 | PASS | scrollWidth=375, viewport=375 |
| No horizontal scroll at 320px | 2026-03-24 | 98f27d27 | PASS | scrollWidth=320, viewport=320 |
| Mobile hamburger tap target 44x44 | 2026-03-24 | 98f27d27 | PASS | Button bounding box: 44×44px |
| Mobile sidebar overlay (hamburger tap) | 2026-03-24 | 98f27d27 | PASS | fixed+overlay+aside all appear; backdrop dimming works |
| Swipe right from left edge opens sidebar | 2026-03-24 | 98f27d27 | PASS | x=5→80 (75px travel, from ≤20px edge) → sidebar opens |
| Swipe from non-edge doesn't open | 2026-03-24 | 98f27d27 | PASS | x=100→200 → sidebar stays closed |
| Swipe no-op on tablet (768px) | 2026-03-24 | 98f27d27 | PASS | Swipe at 768px tablet viewport → sidebar stays closed |
| Desktop layout unchanged (1920px) | 2026-03-24 | 98f27d27 | PASS | Three-column layout matches desktop spec |
| Ctrl+B sidebar toggle | 2026-03-24 | 98f27d27 | FAIL | No effect at desktop (1280px) or tablet — sidebar stays at 256px. Bug filed [qa/P1]. |
| Collapse sidebar button (desktop) | 2026-03-24 | 98f27d27 | FAIL | Clicking button has no visible effect. Related to Ctrl+B bug. |
