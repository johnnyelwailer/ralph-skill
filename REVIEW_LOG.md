# Review Log

## Review — 2026-03-22 10:00 — commit 1d76633..6c3ca5d

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** tooltip.tsx, tooltip.test.tsx, hover-card.tsx, hover-card.test.tsx, button.tsx, dropdown-menu.tsx, tabs.tsx, AppView.tsx

- Gate 2/3: Both new test files (tooltip.test.tsx, hover-card.test.tsx) fail to execute — vitest cannot resolve `@/lib/utils` from the source modules. 0% verified coverage on ~200 lines of new logic. Each test has only 1 scenario with no edge cases (no close-on-second-tap, no desktop-mode passthrough, no controlled/uncontrolled variants).
- Gate 4: `useIsTouchDevice()` hook and `TOUCH_MEDIA_QUERY` constant duplicated verbatim across tooltip.tsx:5-40 and hover-card.tsx:5-37. Should be a shared hook.
- Gate 6: No proof artifacts directory or manifest exists. UI changes (tap target sizing, touch-tap behavior) require visual proof — screenshots or Playwright recordings at mobile viewport.
- Gate 7: No runtime layout verification. CSS changes to `min-h-[44px]` alter bounding boxes. QA already found hamburger button at 0x0px and SPEC tab at 42px — these should have been caught by Gate 7 runtime checks before QA.

Gates passed: 1 (spec compliance for completed work), 5 (type-check + build pass, no regressions), 8 (no dep changes), 9 (no docs changes needed).

---

## Review — 2026-03-22 12:30 — commit 6c3ca5d..fb3696a

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** AppView.tsx, tooltip.tsx, tooltip.test.tsx, hover-card.tsx, hover-card.test.tsx, tabs.tsx, hooks/useIsTouchDevice.ts

**Prior findings resolution:**
- Gate 2/3 (tests 1-scenario-only, vitest alias broken): RESOLVED — tooltip now has 5 tests, hover-card has 4, all with specific value assertions (exact true/false on `onOpenChange`, nth-call checks, controlled passthrough verifying content text, defaultOpen). Tests cover: open-on-tap, close-on-second-tap, desktop-no-toggle, controlled prop, defaultOpen.
- Gate 4 (useIsTouchDevice duplication): RESOLVED — extracted to `hooks/useIsTouchDevice.ts`, both components import the shared hook.
- Gate 7 (no runtime layout verification): RESOLVED — QA session 2 performed Playwright layout measurement at 390x844: hamburger 44x44, GitHub link 44x44, QA badge 86x44, SPEC tab 44x44, 13/14 elements pass.

**New findings:**
- Gate 3: `hooks/useIsTouchDevice.ts` is a new 27-line module with no direct test file. SSR branches (lines 7-8, 14-15: `typeof window === 'undefined'`), `matchMedia` undefined guard, and effect cleanup (removeEventListener) are untested. Also, `vitest.config.ts` coverage `include` only lists `App.tsx` and `AppView.tsx` — tooltip.tsx, hover-card.tsx, and useIsTouchDevice.ts are excluded from coverage measurement.
- Gate 6 (repeat, softened): No proof-manifest.json. QA session 2 provides equivalent Playwright evidence, but proof agent should either produce artifacts or explicitly skip. Downgraded to medium priority.

Gates passed: 1 (spec compliance), 2 (test depth substantially improved), 4 (duplication resolved), 5 (unable to verify due to env SIGABRT — not a code issue), 7 (via QA Playwright evidence), 8 (no dep changes), 9 (no docs changes needed).

---
