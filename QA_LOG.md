# QA Log

## QA Session — 2026-03-21 (iteration 1)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-c2jP8b/bin/aloop`
- Version: 1.0.0
- Dashboard dev server: `http://localhost:4041`
- Browser: Playwright 1.58.2 + Chromium
- Mobile viewport: 375x812 (iPhone X)
- Desktop viewport: 1024x768
- Features tested: 3 (+ 1 skipped)

### Results
- PASS: 44x44px minimum tap targets
- PASS: Left-edge swipe gesture opens sidebar
- PASS: Long-press context menu on sessions
- SKIP: Long-press context menu on log entries (no data)
- Unit tests: 90/90 passed (3 test files)

### Bugs Filed
None — all tested features pass.

### Command Transcript

#### 1. Tap Target Audit (Mobile 375x812)
```
Playwright script: qa-tap-targets.mjs
Viewport: 375x812, hasTouch: true, isMobile: true

=== TAP TARGET AUDIT (Mobile 375x812) ===
Total interactive elements: 12
PASS (>= 44x44): 11
FAIL (< 44x44): 1

--- FAILURES ---
  SECTION "" → 375x0px  (invisible element, not a real tap target)

--- ALL ELEMENTS ---
  PASS BUTTON.md:hidden.p-1 "" → 44x44px        (hamburger menu)
  PASS BUTTON.flex.items-center "Current" → 78x44px  (session header)
  PASS BUTTON.flex-1.py-1.5 "Documents" → 188x44px   (tab)
  PASS BUTTON.flex-1.py-1.5 "Activity" → 188x44px    (tab)
  PASS BUTTON.inline-flex "Health" → 65x44px          (health button)
  PASS BUTTON.inline-flex "Send" → 44x44px            (send button)
  PASS BUTTON.inline-flex "Resume" → 44x44px          (resume button)
  ... (remaining elements also pass)
```

#### 2. Left-Edge Swipe Gesture
```
Playwright script: qa-swipe2.mjs (CDP touch events)
Before swipe: sidebar <aside> has width=0 (hidden on mobile)
After CDP swipe (x=5 → x=200): sidebar visually opens
Screenshot evidence: /tmp/qa-after-cdp-swipe.png shows "SESSIONS" sidebar overlay

Also tested: hamburger button click opens sidebar (confirmed via screenshot)
```

#### 3. Long-Press Context Menu on Sessions
```
Playwright script: qa-lp10.mjs (CDP touch events)
1. Open sidebar via hamburger tap
2. Expand "OLDER" group
3. Long-press (700ms) on "Current" session item at (120, 120)
4. Context menu appeared with content:
   - "current"
   - "Status: unknown"
   - "Provider:"
Screenshot evidence: /tmp/qa-lp10-after-longpress.png

Menu detection: 1 element found matching [role="menu"]
```

#### 4. Long-Press on Log Entries (SKIPPED)
```
Activity tab shows "0 events" — no log entries available.
Cannot test long-press on log entries without real session data.
```

#### 5. Unit Tests
```
$ npx vitest run --reporter=verbose
Test Files: 3 passed (3)
Tests: 90 passed (90)
```

#### 6. Layout Verification
```
Mobile (375x812): Single-column layout, hamburger menu, tabs (Documents/Activity), sticky footer with Steer input + Send/Resume buttons
Desktop (1024x768): Sidebar visible, two-column layout (Documents + Activity), header bar with session info, sticky footer
Screenshot evidence: /tmp/qa-mobile-viewport.png, /tmp/qa-lp10-desktop.png
```
