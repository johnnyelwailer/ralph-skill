# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Fixed steer footer on mobile (position:fixed + safe-area) | 2026-03-27 | 9eaac56 | PASS | footer has `fixed bottom-0 inset-x-0 z-30` on mobile, `sm:relative ...` on sm+; main has `pb-[calc(60px+env(safe-area-inset-bottom))]`; structural check (Playwright blocked by full /tmp) |
| Docs panel tabs collapse to dropdown on mobile | 2026-03-27 | 9eaac56 | PASS | Line 1289: mobile trigger with `sm:hidden`; line 1313: `<TabsList className="hidden sm:flex ...">` — correct pattern; structural check |
| Responsive layout: panels stack vertically on mobile | 2026-03-27 | 9eaac56 | PASS | `flex-col` by default, `sm:flex-row` when sidebar closed, `lg:flex-row` at desktop; sidebarCollapsed crash fixed (uses `!sidebarOpen` now); structural check |
| Command palette full-screen on mobile | 2026-03-27 | 9eaac56 | PASS | Outer: `fixed inset-0 z-50 flex items-start`; inner: `w-full min-h-full border-0` on mobile; `sm:max-w-md sm:rounded-lg sm:pt-[20vh]` on sm+ — correct responsive pattern; structural check |
| sidebarCollapsed ReferenceError fix | 2026-03-27 | 9eaac56 | PASS | AppInner line 2509 uses `collapsed={!sidebarOpen}`; all 148 unit tests pass including 7 integration tests |
| ResponsiveLayout hook (unit tests) | 2026-03-27 | 9eaac56 | PASS | All 4 ResponsiveLayout.test.tsx tests pass; all 148 total tests pass |
