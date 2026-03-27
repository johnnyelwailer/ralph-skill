# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Fixed steer footer on mobile (position:fixed + safe-area) | 2026-03-27 | 76c5bac | FAIL | Implementation present in Footer (line 2095) and main pb-[calc...] (line 2522), but AppInner crashes before rendering due to sidebarCollapsed bug — could not verify visually |
| Docs panel tabs collapse to dropdown on mobile | 2026-03-27 | 76c5bac | FAIL | Implementation looks correct (sm:hidden dropdown + hidden sm:flex TabsList), but AppInner crashes before rendering due to sidebarCollapsed bug — could not verify visually |
| Responsive layout: panels stack vertically on mobile | 2026-03-27 | 76c5bac | FAIL | AppInner crashes before rendering due to sidebarCollapsed bug |
| ResponsiveLayout hook (unit tests) | 2026-03-27 | 76c5bac | PASS | All 4 ResponsiveLayout.test.tsx tests pass |
