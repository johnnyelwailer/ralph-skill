# QA Log — Issue #112

## QA Session — 2026-03-21 (iteration 5)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-vRrwpn/bin/aloop`
- CLI version: 1.0.0
- Dashboard: `http://localhost:4141` (started via `aloop dashboard --port 4141`)
- Temp dir: `/tmp/qa-test-responsive`
- Browser: Playwright Chromium 145.0.7632.6 (headless)
- Features tested: 5

### Results
- PASS: Desktop layout unchanged (1920x1080) — 3-column layout
- PASS: Mobile hamburger toggle (375px) — opens sidebar overlay
- PASS: No horizontal scroll at 320px
- PASS: No horizontal scroll at 375px
- PASS: ResponsiveLayout context wrapper renders
- FAIL: CSS breakpoint mismatch at 640px boundary
- FAIL: Ctrl+B sidebar toggle (no effect at any viewport)
- FAIL: useBreakpoint hook orphaned (not consumed at runtime)

### Bugs Filed
- [qa/P1] Ctrl+B sidebar toggle has no runtime effect (new finding — TODO says it works, testing proves it doesn't)
- CSS breakpoint mismatch and orphaned hook already tracked as spec-gaps in TODO.md — re-confirmed via testing

### Command Transcript

#### Install CLI
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary under test: /tmp/aloop-test-install-vRrwpn/bin/aloop
$ aloop --version
1.0.0
```

#### Start Dashboard
```
$ aloop dashboard --port 4141
Launching real-time progress dashboard on port 4141...
Session dir: /tmp/qa-test-responsive
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4141/
200
```

#### Desktop 1920x1080
```
Playwright: goto http://localhost:4141 viewport 1920x1080
Screenshot: /tmp/qa-screenshot-desktop.png
  PASS: Page loads with content — content length=886
  PASS: No horizontal scroll — true
  PASS: Layout 3-column (Sessions 256px | Documents | Activity)
  md:hidden/flex elements: hamburger button (md:hidden), sidebar panel (hidden md:flex)
```

#### Tablet 768x1024
```
Playwright: goto http://localhost:4141 viewport 768x1024
Screenshot: /tmp/qa-screenshot-tablet-768.png
  PASS: No horizontal scroll
  Sidebar: aside visible (w=10, icon rail), session list panel visible via md:flex
```

#### Boundary 640x900
```
Playwright: goto http://localhost:4141 viewport 640x900
Screenshot: /tmp/qa-screenshot-boundary-640.png
  FAIL: Sidebar (hidden md:flex) visible=false at 640px
  Hamburger (md:hidden) visible=true at 640px
  SPEC says 640px = tablet, but layout shows mobile behavior
  Root cause: CSS uses md: (768px) not sm: (640px)
```

#### Mobile 375x812
```
Playwright: goto http://localhost:4141 viewport 375x812
Screenshot: /tmp/qa-screenshot-mobile-375.png
  PASS: scrollWidth=375, clientWidth=375, no overflow
  PASS: Hamburger (md:hidden) visible
  Click hamburger → overlay appears (fixed inset-0 z-40 animate-fade-in)
Screenshot after click: /tmp/qa-hamburger-open-375.png
  Session list visible and scrollable in overlay
```

#### Mobile 320x568
```
Playwright: goto http://localhost:4141 viewport 320x568
Screenshot: /tmp/qa-screenshot-mobile-320.png
  PASS: scrollWidth=320, clientWidth=320, no overflow
```

#### Ctrl+B Test (all viewports)
```
Playwright: Ctrl+B at 768px tablet
  Before: sidebar panel w=256 visible=true
  After: sidebar panel w=256 visible=true
  NO CHANGE

Playwright: Ctrl+B at 1920px desktop
  Before: sidebar panel w=256 visible=true, aside w=256
  After: sidebar panel w=256 visible=true, aside w=256
  NO CHANGE
```

#### At 769px (just above md: boundary)
```
  Hamburger visible: false (correct — md:hidden hides it at ≥768px)
  Sidebar visible: true (correct — md:flex shows it at ≥768px)
```
