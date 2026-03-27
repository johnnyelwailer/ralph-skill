# Review Log

## Review — 2026-03-27 — commits 02d537ec1..29b6a4c3c

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/AppView.tsx`, `aloop/cli/dashboard/e2e/smoke.spec.ts`, `aloop/cli/dashboard/e2e/proof.spec.ts`

### Gate 4: Dead Code

- `AppView.tsx:2199` — `mobileSidebarRef = useRef<HTMLDivElement>(null)` is attached to the mobile drawer div but never read anywhere. Provides no functionality.
- `AppView.tsx:2211-2225` — `handleTouchStart` and `handleTouchEnd` are defined with `useCallback` but are **not attached to any JSX element**. The root `<div>` at line 2505 has no `onTouchStart`/`onTouchEnd` props. The swipe-right-to-open gesture is entirely disabled.

### Gate 5: Regressions — 4 Playwright tests fail

Ran `npx playwright test` from `aloop/cli/dashboard/`. 4 of 11 tests fail:

1. **`proof.spec.ts:149`** — "desktop layout unchanged, no collapse button": The `Sidebar` at AppView.tsx:2509 is missing `isDesktop={isDesktop}`. The `Sidebar` component hides the "Collapse sidebar" button only when `isDesktop=true` (`{!isDesktop && ...}` at line 938). Without the prop it defaults to `undefined`, so the button is visible at desktop.

2. **`proof.spec.ts:103`** — "swipe gesture opens sidebar": Swipe handlers defined but not attached (see Gate 4 above). Dispatching `touchstart`/`touchend` events on the root element has no effect.

3. **`smoke.spec.ts:135`** — "mobile shows only one panel and mobile menu": The old toggle bar (Documents/Activity buttons) was removed; both panels now always render stacked. The test asserts Activity is hidden and a 'Activity' toggle button exists — both assertions now fail.

4. **`smoke.spec.ts:154`** — "mobile keeps key controls at minimum 44x44 tap size": Looks for `button[name='Documents']` and `button[name='Activity']` (the removed toggle buttons) — elements not found.

### Gates 1, 2, 3, 6, 8, 9 — PASS

- Gate 1: Spec compliance — fixed footer, docs dropdown, command palette full-screen, and sidebarCollapsed bug fix all implemented per spec.
- Gate 2: 148 unit tests pass; assertions are concrete (class name checks, element existence with specific attributes).
- Gate 3: All 20 vitest test files pass; no new modules without tests.
- Gate 6: Proof was structural inspection (Playwright was blocked at QA time). Verified via Playwright now — 7/11 E2E tests pass for the structural claims; failures are regressions, not proof fabrication.
- Gate 8: No dependency changes in this iteration.
- Gate 9: No README/docs changes needed for internal responsive CSS work.

### Findings written to TODO.md: 4 [review] tasks (3 high priority, 1 low)
