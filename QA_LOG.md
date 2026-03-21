# QA Log — Issue #84

## QA Session — 2026-03-21 (iteration 17)

### Binary Under Test
- Dashboard running on http://localhost:43575 (orchestrator session port)
- CLI build failed due to esbuild not in PATH — tested dashboard UI directly via Playwright
- Note: CLI `npm run test-install` fails with `sh: 1: esbuild: not found` in `build:server` script (bare `esbuild` not in PATH; `npx esbuild` works)

### Test Environment
- Playwright Chromium (fallback ubuntu24.04-arm64 build)
- Desktop viewport: 1920x1080 (hasTouch: false)
- Touch viewport: 375x812 (hasTouch: true, iPhone UA)
- Features tested: 3 completed + 2 layout checks

### Results
- PASS: useIsTouchLikePointer hook
- PASS: Dashboard layout (desktop 1920x1080 and mobile 320x568)
- FAIL: Tooltip tap-toggle on touch devices (bug filed)
- INCONCLUSIVE: useLongPress hook (no consumer wired up yet)

### Bugs Filed
- [qa/P1] Tooltip tap-toggle not working on touch devices

### Command Transcript

#### Layout Verification (Desktop 1920x1080)
```
$ node /tmp/qa-layout-verify.mjs
--- Desktop Layout (1920x1080) ---
Layout panels/sidebar elements found: 3
Main layout: Root child tag: DIV, children: 2, classes: h-screen flex flex-col bg-background text-foreground overflow-hidden
Page title: Aloop Dashboard
Page has content: true (1750 chars)
Horizontal scroll at 1920px: false

--- Mobile (320x568) ---
Horizontal scroll at 320px: false
Hamburger menu present at 320px: false  ← false negative (selector mismatch); screenshot confirms hamburger IS visible
```
Evidence: /tmp/qa-desktop-1920x1080.png, /tmp/qa-mobile-320x568.png

#### useIsTouchLikePointer Hook
```
$ node /tmp/qa-touch-features.mjs (excerpt)
Desktop (no touch): pointer:coarse matches = false  → Expected: false — PASS
Touch device emulation: pointer:coarse matches = true  → Expected: true — PASS
```

#### Tooltip Tap-Toggle (Touch Device)
```
$ node /tmp/qa-tooltip-deep.mjs
=== Finding all tooltip instances ===
Elements with tooltip-related attrs: 0

--- Hover test on sidebar collapse ---
Tooltips after hover: 1
  "Collapse (Ctrl+B)" id="radix-:r0:"

=== Touch device tooltip tap-toggle ===
--- Checking all buttons have accessible tap behavior on touch ---
Tap-accessible buttons: 0    ← BUG: no tooltips appear on tap
```
Evidence: /tmp/qa-desktop-tooltip-hover.png

#### Tooltip Hover (Desktop) — Confirmed Working
```
Hovering sidebar collapse button → tooltip "Collapse (Ctrl+B)" appears (Radix tooltip, id=radix-:r0:)
```
Evidence: /tmp/qa-desktop-tooltip-hover.png — tooltip visible top-left near sidebar

#### Tap Target Size Audit
```
$ node /tmp/qa-tooltip-deep.mjs (excerpt)
Undersized tap targets (< 44x44): 12/36
  ✗ "unlabeled" 28x28px           ← likely sidebar toggle icon
  ✗ "orchestrator-..." 138x20px   ← session card button, too short
  ✗ "Documents" 188x28px          ← tab, too short
  ✗ "Activity" 188x28px           ← tab, too short
  ✗ "TODO" 46x24px                ← doc tab, too short
  ✗ "SPEC" 42x24px                ← doc tab, too short
  ✗ "RESEARCH" 70x24px            ← doc tab, too short
  ✗ "Health" 65x24px              ← doc tab, too short
  ✗ "unlabeled" 24x24px           ← external link icon
```
Note: tap target enforcement is still a TODO item, so undersized targets are expected.

### Screenshots
- /tmp/qa-desktop-1920x1080.png — Desktop layout verification
- /tmp/qa-mobile-320x568.png — Mobile layout verification
- /tmp/qa-desktop-tooltip-hover.png — Desktop tooltip hover working
- /tmp/qa-touch-after-tap-stop.png — Touch: Stop dropdown (not tooltip) works on tap
- /tmp/qa-touch-activity.png — Touch: Activity tab view
