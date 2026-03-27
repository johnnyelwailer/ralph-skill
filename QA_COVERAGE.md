# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Fixed steer footer on mobile (position:fixed + safe-area) | 2026-03-27 | 9eaac56 | PASS | footer has `fixed bottom-0 inset-x-0 z-30` on mobile, `sm:relative ...` on sm+; main has `pb-[calc(60px+env(safe-area-inset-bottom))]`; structural check (Playwright blocked by full /tmp) |
| Docs panel tabs collapse to dropdown on mobile | 2026-03-27 | 9eaac56 | PASS | Line 1289: mobile trigger with `sm:hidden`; line 1313: `<TabsList className="hidden sm:flex ...">` — correct pattern; structural check |
| Responsive layout: panels stack vertically on mobile | 2026-03-27 | 9eaac56 | PASS | `flex-col` by default, `sm:flex-row` when sidebar closed, `lg:flex-row` at desktop; sidebarCollapsed crash fixed (uses `!sidebarOpen` now); structural check |
| Command palette full-screen on mobile | 2026-03-27 | 9eaac56 | PASS | Outer: `fixed inset-0 z-50 flex items-start`; inner: `w-full min-h-full border-0` on mobile; `sm:max-w-md sm:rounded-lg sm:pt-[20vh]` on sm+ — correct responsive pattern; structural check |
| sidebarCollapsed ReferenceError fix | 2026-03-27 | 9eaac56 | PASS | AppInner line 2509 uses `collapsed={!sidebarOpen}`; all 148 unit tests pass including 7 integration tests |
| ResponsiveLayout hook (unit tests) | 2026-03-27 | 9eaac56 | PASS | All 4 ResponsiveLayout.test.tsx tests pass; all 148 total tests pass |
| Desktop sidebar: Collapse button hidden at desktop (isDesktop prop) | 2026-03-27 | 94dfde9 | PASS | `isDesktop={isDesktop}` passed at AppView.tsx:2509; `{!isDesktop && <button "Collapse sidebar">}` at line 938; proof.spec.ts:149 PASS via Playwright E2E |
| Swipe-right-to-open sidebar gesture on mobile | 2026-03-27 | abfe37d | PASS | `onTouchStart/onTouchEnd` attached to root div at AppView.tsx:2505; `handleTouchEnd` calls `setMobileMenuOpen(true)`; proof.spec.ts:103 PASS via Playwright E2E |
| All proof.spec.ts E2E tests (5 tests) | 2026-03-27 | abfe37d | PASS | All 5 proof tests pass: mobile hamburger, sidebar drawer, swipe gesture, tablet layout, desktop no-collapse |
| smoke.spec.ts panel toggle tests (2 tests) | 2026-03-27 | 64b5223 | PASS | Re-tested after Gate 5 fix (commit 35ef8ced7). smoke:135 now asserts both panels visible simultaneously on mobile; smoke:154 updated to check 44px tap targets for steer/send/stop — all 11 E2E tests pass |
| Dead code removal: mobileSidebarRef (Gate 4) | 2026-03-27 | 64b5223 | PASS | Dead ref removed per Gate 4 task; all 148 unit tests + 11 E2E tests pass after removal |
| Full E2E suite (smoke + proof, 11 tests) | 2026-03-27 | 64b5223 | PASS | All 11 Playwright E2E tests pass via `npx playwright test`; 148 unit tests pass via `npx vitest run` |
