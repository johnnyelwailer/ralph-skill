# QA Log

## QA Session — 2026-03-24 (iteration 12)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-CfcFNO/bin/aloop` (v1.0.0)
- Dashboard: `http://localhost:14040` (Vite dev server from dashboard source)
- Playwright: headless Chromium
- Temp test dir: `/tmp/qa-test-issue112`
- Features tested: 5

### Results
- PASS: useBreakpoint unit tests (147 tests), TypeScript, build
- PASS: Hamburger visibility at sm: breakpoint (639px vs 641px)
- PASS: No horizontal overflow at 320px and 375px
- PASS: Mobile sidebar overlay (hamburger tap)
- PASS: Swipe gesture (open from edge, no-op from non-edge, no-op on tablet)
- FAIL: Ctrl+B sidebar toggle (no effect)
- FAIL: Collapse sidebar button (no effect)

### Bugs Filed
- [qa/P1] Ctrl+B sidebar toggle has no runtime effect — sidebar state unchanged at desktop/tablet; "Collapse sidebar" button also broken

### Command Transcript

```
# Install from source
$ cd /worktree && ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary: /tmp/aloop-test-install-CfcFNO/bin/aloop
$ aloop --version
1.0.0

# Unit tests
$ npm test -- --run  (from aloop/cli/dashboard)
✓ 147 tests passed in 2.74s

# TypeScript
$ tsc --noEmit
(no output — clean)

# Build
$ npm run build
✓ built in 1.29s

# Browser tests (Playwright headless Chromium)
# All tests run from aloop/cli/dashboard/ using local playwright

TEST 1: Desktop 1920x1080
  scrollWidth=1920, overflow=false ✓
  Page has content: true ✓
  Screenshot: /tmp/qa-desktop-1920.png

TEST 2: Mobile 375px
  scrollWidth=375, overflow=false ✓ PASS
  Screenshot: /tmp/qa-mobile-375.png

TEST 3: Mobile 320px
  scrollWidth=320, overflow=false ✓ PASS
  Screenshot: /tmp/qa-mobile-320.png

TEST 4: Breakpoint boundary 639px
  Hamburger "Toggle sidebar" visible ✓
  Screenshot: /tmp/qa-bp-639.png

TEST 5: Breakpoint boundary 641px
  Hamburger NOT visible ✓ (sm:hidden kicks in)
  Sidebar wrapper visible (hidden sm:flex → display:flex) ✓
  Screenshot: /tmp/qa-bp-641.png

TEST 6: Mobile sidebar overlay (touch context, 375x667)
  Hamburger button at (12, 8), 44×44px ✓ (meets tap target requirement)
  After hamburger tap:
    - DIV.fixed.inset-0.z-40.animate-fade-in (375px wide) ✓
    - DIV.absolute.inset-0.bg-black/50 (backdrop) ✓
    - ASIDE.bg-sidebar.w-64 (256px drawer) ✓
  Screenshot: /tmp/qa-mobile-touch-sidebar-open.png

TEST 7: Swipe gesture (touch context, 375px)
  Initial state: closed
  Swipe x=5→80 (75px, from within 20px edge): sidebar = open ✓ PASS
  Swipe x=100→200 (100px, from outside 20px): sidebar = closed ✓ PASS
  Screenshot: /tmp/qa-swipe-test.png

TEST 8: Swipe no-op at tablet (768px touch)
  Swipe x=5→80 at 768px: sidebar = closed ✓ PASS (swipe only active on mobile)

TEST 9: Ctrl+B toggle at desktop (1280px)
  Key events captured: Ctrl+b fires ✓
  Before: sidebar width=256px, class="flex flex-col border-r border-border bg-sidebar w-64..."
  After Ctrl+B: sidebar width=256px (UNCHANGED) ✗ FAIL
  After 2nd Ctrl+B: sidebar width=256px (UNCHANGED) ✗ FAIL
  Wrapper class before/after: "hidden sm:flex" (UNCHANGED)
  Same result with page.keyboard.press(), keyboard.down/up sequence, document.dispatchEvent

TEST 10: Collapse sidebar button (desktop 1280px)
  Button "Collapse sidebar" visible at (219,8) 24×24px
  After clicking: sidebar class unchanged, display unchanged, offsetWidth=256 ✗ FAIL
  Screenshot: /tmp/qa-desktop-after-collapse.png

### Root cause hypothesis (Ctrl+B / Collapse button)
  The build agent's commit 98f27d27 refactored sidebar state management from
  local AppView state (mobileMenuOpen/mobileSidebarRef) to ResponsiveLayout context
  (sidebarOpen/closeSidebar). The Ctrl+B keyboard handler and the desktop "Collapse
  sidebar" onClick likely still reference the old local state setters (setSidebarCollapsed
  or setMobileMenuOpen) rather than the new context's toggleSidebar/openSidebar,
  so pressing the key or clicking the button updates stale local state that has no
  visible effect on the layout.
```

### Screenshots
- `/tmp/qa-desktop-1920.png` — Desktop layout (1920px)
- `/tmp/qa-mobile-375.png` — Mobile 375px (no overflow)
- `/tmp/qa-mobile-320.png` — Mobile 320px (no overflow)
- `/tmp/qa-bp-639.png` — 639px (hamburger visible)
- `/tmp/qa-bp-641.png` — 641px (hamburger hidden, sidebar visible)
- `/tmp/qa-mobile-touch-sidebar-open.png` — Sidebar overlay open (mobile)
- `/tmp/qa-swipe-test.png` — Swipe gesture result
- `/tmp/qa-desktop-after-collapse.png` — Sidebar unchanged after collapse click (bug evidence)
