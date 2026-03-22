# QA Log — Issue #114

## QA Session — 2026-03-22 (iteration 1)

### Binary Under Test
- Path: `/tmp/aloop-test-install-IOmZf9/bin/aloop`
- Version: 1.0.0

### Test Environment
- Dashboard URL: http://localhost:4343
- Session dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-114-20260322-083233
- Browser: Playwright Chromium (headless)
- Mobile viewport: 390x844 (iPhone 12-like, hasTouch=true)
- Desktop viewport: 1920x1080
- Features tested: 3 (tap targets, tooltip tap, hover card tap)

### Results
- FAIL: Tap target sizing (4 elements undersized on mobile)
- PASS: Tooltip tap behavior
- PASS: HoverCard tap equivalents

### Bugs Filed (5 total)
- [qa/P1] GitHub repo link icon 24x24px on mobile (no mobile size override)
- [qa/P1] QA badge button 87x39px on mobile (height 39px < 44px)
- [qa/P1] Hamburger button renders 0x0px on mobile (has CSS classes but zero dimensions)
- [qa/P1] SPEC tab trigger 42x44px on mobile (width 42px < 44px)
- [qa/P1] Hamburger button missing aria-label

### Detailed Results

#### Feature 1: Tap Target Sizing (WCAG 2.5.8 — 44x44px minimum)

**Mobile viewport (390x844, touch, isMobile):**

```
$ node test-mobile-a11y.mjs
=== TEST 1: Tap Target Sizing (WCAG 2.5.8 - 44x44px) ===
  PASS: 10 elements meet 44x44px minimum
  FAIL: 4 elements below 44x44px:
    - "QA N/A" (button): 87x39px
    - "TODOSPECRESEARCH Health" (tablist): 348x32px (container, individual tabs below)
    - "SPEC" (tab): 42x44px
    - "<A>" (link): 24x24px
```

Elements that PASS on mobile:
- Documents tab: 44px+ height
- Activity tab: 44px+ height
- TODO tab: 46x44px
- RESEARCH tab: 70x44px
- Health tab: 65x44px
- Send button: 44x44px
- Stop button: 44x44px
- Steer input: 44px+ height

Elements that FAIL on mobile:
1. **GitHub repo link** (`<a>` with `h-6 w-6`): 24x24px — explicit size classes override min-h/min-w
2. **QA N/A badge**: 87x39px — missing `min-h-[44px]` class
3. **Hamburger button**: 0x0px — has `min-h-[44px] min-w-[44px]` classes but renders at zero size
4. **SPEC tab**: 42x44px — 2px too narrow

**Desktop viewport (1920x1080):**
- 14 buttons smaller than 44x44 on desktop — EXPECTED (the `md:min-h-0 md:min-w-0` correctly relaxes sizing on desktop)
- Confirms the mobile-first approach is correct in principle

**CSS class verification:**
- `min-h-[44px]` classes present in DOM: YES
- `min-w-[44px]` classes present in DOM: YES
- Mobile-first with `md:` breakpoint relaxation pattern: CONFIRMED

Screenshots:
- `/tmp/qa-test-114/mobile-layout.png` — Mobile layout at page load
- `/tmp/qa-test-114/desktop-layout.png` — Desktop layout at page load
- `/tmp/qa-test-114/mobile-sidebar-open.png` — Mobile after hamburger tap
- `/tmp/qa-test-114/mobile-after-tap.png` — Mobile after interaction

#### Feature 2: Tooltip Tap Behavior

**Desktop viewport with touch (1920x1080, hasTouch=true):**

```
$ node test-desktop-tooltips.mjs
=== Desktop Tooltip Tap Test ===
  TOOLTIP FOUND on "": "Running"
  TOOLTIP FOUND on "": "Provider: geminiStatus: cooldownReason: unknownCooldown until: 10:46:27 AM (52min left)"
Tooltips triggered: 4
```

- Status dot tooltip: click/tap triggers tooltip showing "Running" — PASS
- Provider status tooltip: click/tap triggers tooltip with detailed provider info — PASS
- Tooltips show correct, useful content with provider status, cooldown times
- Tooltip dismissed correctly when clicking elsewhere

**Mobile viewport (390x844):**
- Tooltip triggers not visible in mobile main view (status dots are in sidebar/header area)
- Header buttons tapped but no tooltips appeared — the relevant tooltip triggers may be hidden at this breakpoint

#### Feature 3: HoverCard Tap Equivalents

**Desktop viewport with touch (1920x1080, hasTouch=true):**

```
$ node test-desktop-tooltips.mjs
=== Activity Panel HoverCard Test ===
Provider badges found: 2
  HOVER CARD on "gemini": "Provider: geminiStatus: cooldownReason: unknownCooldown until: 10:46:27 AM (52mi"
```

- Provider badge ("gemini") HoverCard: click/tap opens detailed provider card — PASS
- Content shows: provider name, status, cooldown reason, cooldown until time
- HoverCard dismissed correctly when clicking elsewhere

### Command Transcript

```bash
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>&1 | grep -E '^/' | tail -1)
# Output: /tmp/aloop-test-install-IOmZf9/bin/aloop

$ALOOP_BIN --version
# Output: 1.0.0

# Start dashboard
$ALOOP_BIN dashboard --port 4343 --session-dir $SESSION_DIR --workdir $WORKDIR &
# Output: Launching real-time progress dashboard on port 4343...

# Verify dashboard responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:4343
# Output: 200

# Install Playwright
npx playwright install chromium
# Exit code: 0

# Run mobile accessibility test
node test-mobile-a11y.mjs
# Exit code: 0, results above

# Run desktop tooltip/hovercard test
node test-desktop-tooltips.mjs
# Exit code: 0, results above

# Run detailed mobile sidebar test
node test-mobile-sidebar.mjs
# Exit code: 0, results above
```

## QA Session — 2026-03-22 (iteration 2)

### Binary Under Test
- Path: `/tmp/aloop-test-install-GZGBHj/bin/aloop`
- Version: 1.0.0

### Test Environment
- Dashboard URL: http://localhost:4344
- Session dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-114-20260322-083233
- Browser: Playwright Chromium (headless)
- Mobile viewport: 390x844 (iPhone 12-like, hasTouch=true, isMobile=true)
- Features tested: 5 (tap target re-test, tooltip mobile tap, long-press context menu, ARIA labels, hover-card tap)

### Results
- PASS (partial): Tap target sizing — 4/5 previous P1 bugs fixed, 1 new bug (steer textarea)
- PASS: Tooltip tap behavior on mobile — tooltips appear on tap in mobile viewport
- N/A: Long-press context menu — not yet implemented
- PASS (partial): ARIA labels & roles — buttons all pass, GitHub link missing aria-label
- PASS: HoverCard tap equivalents (no re-test needed, still passing)

### Bugs Filed (2 new)
- [qa/P1] Steer textarea 32px height on mobile (min-height: 32px, needs 44px)
- [qa/P1] GitHub repo link missing aria-label (icon-only link, no accessible name)

### Detailed Results

#### Feature 1: Tap Target Sizing Re-test (Regression Verification)

**Mobile viewport (390x844, touch, isMobile):**

```
$ node test-tap-targets.mjs
=== TEST 1: Tap Target Sizing (WCAG 2.5.8 - 44x44px) ===
--- Mobile viewport (390x844, touch, isMobile) ---
  PASS: 13 elements meet 44x44px minimum
    + "Toggle sidebar": 44x44px
    + "orchestrator-20260321-172932": 130x44px
    + "QA 0%": 86x44px
    + "Documents": 195x44px
    + "Activity": 195x44px
    + "TODO": 44x44px
    + "SPEC": 44x44px
    + "RESEARCH": 68x44px
    + "REVIEW LOG": 77x44px
    + "Health": 63x44px
    + "<A>": 44x44px
    + "Send": 44x44px
    + "Stop": 44x44px
  FAIL: 1 elements below 44x44px:
    - "<TEXTAREA>" (TEXTAREA): 266x32px

--- Regression check: previously-failing elements ---
  GitHub link: 44x44px PASS
  QA badge: not visible (scrolled out) — confirmed 86x44 when visible PASS
  Hamburger: 44x44px PASS
  SPEC tab: 44x44px PASS

--- All tab triggers ---
  Tab "TODO": 44x44px PASS
  Tab "SPEC": 44x44px PASS
  Tab "RESEARCH": 68x44px PASS
  Tab "REVIEW LOG": 77x44px PASS
  Tab "Health": 63x44px PASS
```

**Previous P1 bugs status:**
1. GitHub repo link 24x24 → NOW 44x44px — **FIXED**
2. QA badge 87x39 → NOW 86x44px — **FIXED**
3. Hamburger 0x0 → NOW 44x44px — **FIXED**
4. SPEC tab 42x44 → NOW 44x44px — **FIXED**
5. Hamburger missing aria-label → NOW has `aria-label="Toggle sidebar"` — **FIXED**

**New finding:** Steer textarea renders at 266x32px — `min-height: 32px` CSS, no mobile override to 44px. Bug filed.

#### Feature 2: Tooltip Tap Behavior on Mobile

**Mobile viewport (390x844, touch, isMobile) — with sidebar open:**

```
$ node test-tooltip-mobile.mjs
=== Mobile Tooltip Tap Test ===
Sidebar opened
Status dots found: 86
  TOOLTIP on "orchestrator-20260321-172932": "orchestrator-20260321-172932"
  TOOLTIP on status dot: "Running"
  TOOLTIP on SSE indicator: "SSE connection: Live"
  TOOLTIP on GitHub link: "Open repo on GitHub"

=== Summary ===
Tooltip tap on mobile: PASS
```

**Improvement from session 1:** Session 1 noted "Tooltip triggers not visible in mobile main view" — this session opened the sidebar first and confirmed tooltips work on mobile with touch.

#### Feature 3: Long-Press Context Menu

**Mobile viewport (390x844, touch, isMobile):**

- Attempted mouse-based and touch-based long-press on session card buttons
- No context menu appeared after 600ms hold
- **Expected:** Long-press context menu is not yet implemented per TODO.md
- RESULT: N/A (not a bug — feature not implemented yet)

#### Feature 4: ARIA Labels & Roles

**Mobile viewport (390x844):**

```
$ node test-aria.mjs
=== ARIA Labels & Roles Audit ===
  PASS: All visible buttons have accessible labels

--- Links ---
  FAIL: 1 links missing accessible labels:
    - href="https://github.com/..." inner="<svg ...>"

--- Hamburger Button ---
  Hamburger aria-label: "Toggle sidebar" PASS

--- Dropdown/Menu Triggers ---
  Elements with aria-haspopup: 1
    BUTTON aria-haspopup="menu" text="Stop"
```

- All buttons: PASS — every visible button has text content or aria-label
- Hamburger: PASS — has `aria-label="Toggle sidebar"` (verified fix from session 1)
- GitHub repo link: FAIL — icon-only `<a>` with SVG, no `aria-label` or `title`. Bug filed.
- Dropdown triggers: 1 found with proper `aria-haspopup="menu"` (Stop button)

### Command Transcript

```bash
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Output: /tmp/aloop-test-install-GZGBHj/bin/aloop

$ALOOP_BIN --version
# Output: 1.0.0

# Start dashboard
$ALOOP_BIN dashboard --port 4344 --session-dir $SESSION_DIR --workdir $WORKDIR &
# Output: Launching real-time progress dashboard on port 4344...

# Verify dashboard responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:4344
# Output: 200

# Install Playwright
npx playwright install chromium
# Exit code: 0

# Run tap target regression test
node test-tap-targets.mjs
# Exit code: 0, results above

# Run mobile tooltip test
node test-tooltip-mobile.mjs
# Exit code: 1 (desktop portion timed out, mobile results valid)

# Run ARIA + long-press test
node test-aria.mjs
# Exit code: 0 (partial — long-press section hung, results above are valid)
```

## QA Session — 2026-03-22 (iteration 3)

### Binary Under Test
- Path: `/tmp/aloop-test-install-8qPBlq/bin/aloop`
- Version: 1.0.0

### Test Environment
- Dashboard URL: http://localhost:4345
- Session dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-114-20260322-083233
- Browser: Playwright Chromium (headless)
- Mobile viewport: 390x844 (iPhone 12-like, hasTouch=true, isMobile=true)
- Additional viewport: 320x568 (iPhone SE)
- Features tested: 5 (P1 re-test, hover-only, focus management, 320px layout, command palette)

### Results
- FAIL: Steer textarea still 32px (P1 still open)
- FAIL: GitHub link still missing aria-label (P1 still open)
- FAIL: Focus management — 3 new bugs
- PASS: Hover-only interactions — none found
- PASS: 320px viewport — no horizontal scroll
- PASS: Overlay click closes sidebar
- PASS: Escape closes command palette
- PASS: Tab order logical

### Bugs Filed (3 new, 2 re-confirmed)

**Re-confirmed (still failing):**
- [qa/P1] Steer textarea 32px height on mobile — still 266x32px, min-height: 32px
- [qa/P1] GitHub repo link missing aria-label — renders 44x44px but no aria-label/title/text

**New:**
- [qa/P1] Escape key does not close mobile sidebar drawer
- [qa/P1] Focus not moved into sidebar on mobile open
- [qa/P1] Command palette focus not trapped on open (focus on BODY, not search input)

### Detailed Results

#### Feature 1: P1 Bug Re-test (Steer Textarea + GitHub Link)

**Mobile viewport (390x844, touch, isMobile):**

```
=== TEST 1: Re-test Open P1 Bugs ===
  Steer textarea: 266x32px, min-height: 32px
  FAIL: Steer textarea height 32px < 44px
  GitHub link: aria-label="null", title="null", text=""
  FAIL: GitHub link has no accessible name
```

- Steer textarea: computed `min-height: 32px`, no mobile override. Still needs `min-h-[44px] md:min-h-[32px]`.
- GitHub link: renders at 44x44px (tap target size fixed from session 1) but has zero accessible name — SVG-only content with no aria-label, title, or visible text.

#### Feature 2: Hover-Only Interactions

**Desktop viewport (1920x1080, hasTouch=true):**

```
=== TEST 2: Hover-Only Interactions ===
  N/A: No overflow button found (fewer tabs than threshold)
  Elements with group-hover (no click parent): 0
  Radix tooltip triggers: 1
```

- Overflow tabs button: not rendered (fewer than 5 tabs in current session, so threshold not met)
- Scanned all DOM elements for `group-hover` class with no click parent — 0 found
- No visible hover-only content-revealing interactions detected
- RESULT: PASS — no hover-only issues at current state

#### Feature 3: Focus Management (Mobile)

**Mobile viewport (390x844, touch, isMobile):**

```
=== Sidebar Close Mechanisms ===
  Sidebar after open: [{"visible":false,"width":0},{"visible":true,"width":256}]
  Sidebar after Escape: [{"visible":false,"width":0},{"visible":true,"width":256}]
  Escape closes sidebar: NO — BUG
  Overlay: {"classes":"fixed inset-0 z-40 md:hidden animate-fade-in","hasClickHandler":true,"pointerEvents":"auto"}
  After mouse click at (350,400): [{"visible":false,"width":0}]
  Overlay click closes sidebar: YES
```

**Findings:**
1. **Escape does NOT close sidebar** — after pressing Escape, both asides remain in same state (mobile drawer at width=256px still visible). The overlay has an onClick handler that works, but no keydown listener for Escape.
2. **Focus stays on hamburger after open** — `document.activeElement` is the hamburger `<BUTTON>` with `aria-label="Toggle sidebar"` after opening sidebar, not an element inside the sidebar.
3. **Overlay click works correctly** — clicking at x=350 (outside sidebar at x=0..256) correctly closes the sidebar via the overlay onClick.

**Command palette:**

```
=== Command Palette ===
  Command palette: {"found":true,"visible":true,"focused":"BODY type=n/a placeholder=\"\""}
  After Escape: visible=false → PASS
```

- Ctrl+K opens command palette dialog (visible=true) — PASS
- Focus lands on `BODY` instead of the search input — BUG
- Escape correctly closes the palette — PASS

**Tab order (sidebar closed):**

```
=== Tab Order (sidebar closed) ===
  Tab 1: <BUTTON> "Toggle sidebar" visible=true
  Tab 2: <BUTTON> "Current" visible=true
  Tab 3: <BUTTON> "QA 0%" visible=true
  Tab 4: <BUTTON> "Documents" visible=true
  Tab 5: <BUTTON> "Activity" visible=true
  Tab 6: <BUTTON> "Health" visible=true role=tab
  Tab 7: <DIV> "No provider data yet." visible=true role=tabpanel
  Tab 8: <TEXTAREA> "" visible=true
  Tab 9: <BUTTON> "Resume" visible=true
```

- Tab order is logical: hamburger → header controls → tabs → content → steer input → action buttons
- All 9 focusable elements are visible — PASS
- No focus traps detected — PASS

#### Feature 4: 320px Viewport Layout

**320x568 viewport (iPhone SE, touch, isMobile):**

```
=== TEST 4: 320px Viewport — No Horizontal Scroll ===
  Document width: 320px, viewport: 320px
  Horizontal scroll: false
  Undersized tap targets at 320px: 1
    <TEXTAREA> "": 196x32px
```

- No horizontal scroll — document.scrollWidth matches window.innerWidth at 320px — PASS
- Only undersized element is the steer textarea (same P1 bug as at 390px)
- All other interactive elements (buttons, tabs, links) meet 44x44px minimum at 320px — PASS

Screenshots:
- `/tmp/qa-session3-mobile.png` — Mobile 390px layout
- `/tmp/qa-session3-320px.png` — 320px viewport layout
- `/tmp/qa-session3-sidebar-open.png` — Mobile sidebar open
- `/tmp/qa-session3-sidebar-links.png` — Sidebar with GitHub link visible
- `/tmp/qa-session3-cmdpalette.png` — Command palette open

### Command Transcript

```bash
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Output: /tmp/aloop-test-install-8qPBlq/bin/aloop

$ALOOP_BIN --version
# Output: 1.0.0

# Start dashboard
$ALOOP_BIN dashboard --port 4345 --session-dir $SESSION_DIR --workdir $WORKDIR &
# Output: Launching real-time progress dashboard on port 4345...

# Verify dashboard responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:4345
# Output: 200

# Install Playwright
npx playwright install chromium
npm install playwright
# Exit code: 0

# Run P1 re-test + hover-only + focus + 320px test
node qa-session3.mjs
# Exit code: 0, results above

# Run sidebar close + command palette + GitHub link deep dive
node qa-session3d.mjs
# Exit code: 0, results above
```

## QA Session — 2026-03-22 (iteration 4)

### Binary Under Test
- Path: `/tmp/aloop-test-install-vCheUl/bin/aloop`
- Version: 1.0.0
- Note: test-install binary does NOT include dashboard assets (`dist/dashboard` missing from npm pack). Dashboard tested via global CLI at `/home/pj/.aloop/cli/aloop.mjs` on port 4347.

### Test Environment
- Dashboard URL: http://localhost:4347 (started via global CLI)
- Session dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-81-20260322-110612
- Browser: Playwright Chromium (headless)
- Desktop viewport: 1920x1080
- Mobile viewport: 390x844 (screenshots from prior run), 320x568
- Features tested: 4 (P1 re-test, ARIA labels, collapse/expand buttons, overflow menu)
- **Environment constraint**: System under extreme memory pressure (440MB free, 16GB swap near-full). Mobile Playwright contexts crashed repeatedly (OOM). Desktop context worked for one test run. Subsequent runs crashed. Visual evidence supplemented via screenshots from earlier in this session.

### Results
- FAIL: GitHub repo link STILL missing aria-label (confirmed via Playwright desktop test)
- FAIL: 2 icon-only buttons missing aria-label on desktop (24x24 and 14x14 — likely sidebar collapse/expand)
- FAIL: ARIA labels for collapse/expand buttons not implemented (0 buttons with collapse/expand/sidebar/panel labels found)
- INCONCLUSIVE: Steer textarea sizing — visual evidence suggests fix may be applied (appears ~44px in screenshots) but exact pixel measurement blocked by OOM
- INCONCLUSIVE: Focus management (Escape closes sidebar, focus into sidebar, command palette focus) — screenshots show command palette input field rendered, but programmatic focus verification blocked by OOM
- N/A: Overflow menu — fewer than 5 tabs visible, overflow threshold not met (same as sessions 1-3)
- PASS: test-install binary installs and runs (`aloop --version` returns 1.0.0)

### Bugs Filed (0 new, 1 re-confirmed, 1 new observation)

**Re-confirmed (still failing):**
- [qa/P1] GitHub repo link missing aria-label — desktop Playwright test confirms `<a href="https://github.com/johnnyelwailer/ralph-skill">` has no `aria-label`, `title`, or text content. Icon-only SVG link. TODO.md marks this as fixed but the deployed dashboard still shows the bug.

**New observation (not a new bug — tracked in TODO):**
- ARIA labels for collapse/expand buttons not yet implemented. TODO.md lists this as "Up Next" (not completed). 0 buttons with `aria-label` matching collapse/expand/sidebar/panel found on desktop. 2 icon-only buttons without any accessible name detected (24x24px and 14x14px).

### Detailed Results

#### Feature 1: P1 Bug Re-test — GitHub Repo Link aria-label

**Desktop viewport (1920x1080) — Playwright automated:**

```
=== TEST 5: ARIA Labels — Desktop ===
  Buttons: 35, icon-only w/o label: 2
    FAIL: icon-only 24x24
    FAIL: icon-only 14x14
  Links: 1, w/o label: 1
    FAIL: <a href="https://github.com/johnnyelwailer/ralph-skill">

  Collapse/expand buttons:
    None found
```

- GitHub link renders as icon-only `<a>` with SVG — no `aria-label`, `title`, or text
- TODO.md marks "[x] Fix QA P1 bugs — steer textarea + GitHub aria-label" as complete, but the fix is not present in the running dashboard
- Possible causes: (a) fix committed but dashboard not rebuilt, (b) fix in a different branch, or (c) fix incomplete

**Mobile viewport (390x844) — visual screenshot analysis:**
- External link icon visible in tab bar (next to "Health" tab)
- Small icon, appears to be the GitHub repo link
- No visible text label next to the icon

#### Feature 2: ARIA Labels on Collapse/Expand Buttons

**Desktop viewport (1920x1080) — Playwright automated:**

- 0 buttons found with `aria-label` containing "collapse", "expand", "sidebar", or "panel"
- 2 icon-only buttons found with no accessible name at all:
  - One at 24x24px — likely sidebar collapse/expand toggle (visible top-left of sidebar in desktop screenshot)
  - One at 14x14px — likely a smaller UI control
- TODO.md lists "Add ARIA labels to collapse/expand buttons" as incomplete (no `[x]`), so this is expected — the task hasn't been done yet
- RESULT: Confirmed NOT IMPLEMENTED (consistent with TODO.md)

#### Feature 3: P1 Bug Re-test — Steer Textarea Sizing

**Mobile viewport (390x844) — visual screenshot analysis only (OOM blocked Playwright):**

- Screenshots show steer textarea at bottom of all mobile views
- Visual height appears consistent with ~44px minimum (not the 32px from sessions 2-3)
- TODO.md marks "[x] Fix QA P1 bugs — steer textarea + GitHub aria-label" with fix description: `min-h-[44px] md:min-h-[32px] h-auto md:h-8`
- RESULT: INCONCLUSIVE — visual evidence suggests PASS but exact pixel measurement needed

#### Feature 4: Focus Management Re-test

**Mobile viewport — visual screenshot analysis only:**

- Command palette screenshot shows "Type a command..." input rendered and appears active
- Cannot programmatically verify `document.activeElement` due to OOM crashes
- Screenshots show sidebar opening and closing correctly
- RESULT: INCONCLUSIVE — needs programmatic verification

#### Feature 5: Overflow Menu Tap/Click

- Tab bar shows: TODO, SPEC, RESEARCH, REVIEW LOG, Health (5 tabs)
- Per spec, overflow triggers when >5 tabs — threshold not met
- External link icon visible but is not a tab overflow button
- RESULT: N/A (same as sessions 1-3)

### Screenshots
- `/tmp/qa-session4-desktop.png` — Desktop 1920x1080 layout (Playwright)
- `/tmp/qa-session4-mobile.png` — Mobile layout (from test-install, shows "assets not found")
- `/tmp/qa-session4-focus.png` — Mobile command palette open
- `/tmp/qa-session4-cmdpalette.png` — Mobile command palette (duplicate of focus)
- `/tmp/qa-session4-tabs.png` — Mobile tab bar (390px)
- `/tmp/qa-session4-320px.png` — 320px viewport layout

### Command Transcript

```bash
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Output: /tmp/aloop-test-install-vCheUl/bin/aloop

$ALOOP_BIN --version
# Output: 1.0.0

# Start dashboard (test-install binary — assets missing)
$ALOOP_BIN dashboard --port 4346 ...
# Output: Dashboard assets not found at /tmp/aloop-test-install-Bhx2BW/lib/node_modules/aloop-cli/dist/dashboard

# Start dashboard (global CLI — assets present)
node /home/pj/.aloop/cli/aloop.mjs dashboard --port 4347 --session-dir $SESSION_DIR --workdir $WORKDIR &
# Output: Launching real-time progress dashboard on port 4347...

# Verify dashboard responds
curl -s http://localhost:4347 | head -3
# Output: <!DOCTYPE html><html lang="en"><head>

# Install Playwright
npx playwright install chromium
# Exit code: 0

# Run desktop ARIA audit (Playwright)
node /tmp/qa-s4-desktop.mjs
# Exit code: 0, results above

# Run mobile tests (Playwright — multiple attempts)
node /tmp/qa-s4-mobile.mjs
# Exit code: 1 — page crashed (OOM)

node /tmp/qa-s4-combined.mjs
# Exit code: 1 — page crashed (OOM)

# System memory at time of crashes
free -h
# Output: Mem: 15Gi total, 14Gi used, 440Mi free, Swap: 16Gi total, 16Gi used, 492Mi free
```

## QA Session — 2026-03-22 (iteration 5)

### Binary Under Test
- Path: `/tmp/aloop-test-install-4wHHRT/bin/aloop`
- Version: 1.0.0
- Note: test-install binary still does NOT include dashboard assets (`dist/dashboard/` missing from npm pack). Dashboard tested via worktree dist at `aloop/cli/dist/index.js` on port 4352.

### Test Environment
- Dashboard URL: http://localhost:4352 (served from worktree dist)
- Session dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-81-20260322-110612
- Browser: Playwright Chromium (headless)
- Desktop viewport: 1920x1080
- Mobile viewport: 390x844 (iPhone 12-like, hasTouch=true, isMobile=true)
- Features tested: 4 (long-press context menu, ARIA labels, focus management, steer textarea + GitHub link)

### Results
- PASS: Long-press context menu — 3 menu items present (Stop, Force-stop, Copy session ID)
- PASS: ARIA labels on collapse/expand — "Collapse sidebar" and "Collapse activity panel" found
- PASS: Focus management — Escape closes sidebar, focus into sidebar on open, focus returns to hamburger, command palette auto-focuses input
- PASS: Steer textarea 50px height (min-height=44px) + GitHub link aria-label="Open repo on GitHub"
- FAIL: test-install packaging — dashboard assets still missing from npm pack

### Bugs Filed (0 new, 1 re-confirmed)

**Re-confirmed (still failing):**
- [qa/P1] test-install packaging: `dist/dashboard/` not included in npm pack. Binary starts but shows "Dashboard assets not found". Same as session 4.

### Detailed Results

#### Feature 1: Long-Press Context Menu (NEW — was N/A)

**Mobile viewport (390x844, touch, isMobile):**

```
Session cards (with time info): 17
Long-pressing: "orchestrator-20260321-17293218h ago·orch_scaniter 381· $0.00" at (220,139)
Menu items after long-press: 3
Items: Stop session, Force-stop session, Copy session ID
Long-press RESULT: PASS
navigator.vibrate: available
```

- Long-press (700ms hold) on session card triggers context menu — PASS
- Menu has 3 items matching TODO.md spec: "Stop session", "Force-stop session", "Copy session ID"
- `navigator.vibrate` API available for haptic feedback
- Screenshot: `/tmp/qa-lp-longpress.png`

#### Feature 2: ARIA Labels on Collapse/Expand Buttons (was FAIL)

**Desktop viewport (1920x1080):**

```
Total visible buttons: 51
Collapse/expand labeled buttons: 2
  "Collapse sidebar" — 24x24
  "Collapse activity panel" — 14x14
Icon-only buttons WITHOUT label: 0
```

- "Collapse sidebar" button (24x24px): has `aria-label` — PASS
- "Collapse activity panel" button (14x14px): has `aria-label` — PASS
- 0 icon-only buttons without accessible name — PASS (was 2 in session 4)
- Note: "Expand sidebar" not found because sidebar is expanded (showing "Collapse sidebar" instead) — correct behavior, label toggles with state

#### Feature 3: Focus Management (was INCONCLUSIVE)

**Mobile viewport (390x844, touch, isMobile):**

```
3a: Focus after open: BUTTON "Collapse sidebar" inSidebar=true
Focus into sidebar: PASS
3b: Escape closes sidebar: PASS
3c: Focus returns to hamburger: PASS

3d: Command palette focus
Focused: INPUT placeholder="Type a command..."
Focus on input: PASS
```

- Focus moves into sidebar on open (to "Collapse sidebar" button inside aside) — PASS
- Escape key closes mobile sidebar drawer — PASS
- Focus returns to hamburger ("Toggle sidebar") after sidebar close — PASS
- Command palette (Ctrl+K) auto-focuses search input (placeholder="Type a command...") — PASS

#### Feature 4: Steer Textarea + GitHub Link (were FAIL)

**Mobile viewport (390x844, touch, isMobile):**

```
Steer textarea: 266x50px, min-height=44px
Height >= 44px: PASS
Interactive elements: 14, undersized: 0
```

- Steer textarea: 266x50px with `min-height: 44px` — PASS (was 32px in sessions 2-3)
- All 14 interactive elements meet 44x44px minimum at mobile viewport — PASS

**Desktop viewport (1920x1080):**

```
GitHub links: 1
  href=https://github.com/johnnyelwailer/ralph-skill aria-label="Open repo on GitHub" text="" 24x24
  Has accessible name: PASS
```

- GitHub repo link: `aria-label="Open repo on GitHub"` — PASS (was FAIL in sessions 2-4)

### Screenshots
- `/tmp/qa-s5-desktop.png` — Desktop 1920x1080 full layout
- `/tmp/qa-s5-mobile.png` — Mobile 390x844 layout
- `/tmp/qa-lp-longpress.png` — Long-press context menu visible

### Command Transcript

```bash
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Output: /tmp/aloop-test-install-4wHHRT/bin/aloop

$ALOOP_BIN --version
# Output: 1.0.0

# Start dashboard (test-install binary — assets missing)
$ALOOP_BIN dashboard --port 4350 ...
# Output: Dashboard assets not found at /tmp/.../dist/dashboard

# Start dashboard (worktree dist — assets present)
node aloop/cli/dist/index.js dashboard --port 4352 --session-dir $SESSION_DIR --workdir $WORKDIR &
# Output: Launching real-time progress dashboard on port 4352...
# Assets dir: .../worktree/aloop/cli/dist/dashboard

# Verify dashboard responds
curl -s http://localhost:4352 | head -c 200
# Output: <!DOCTYPE html><html lang="en">...

# Install Playwright
cd /tmp && npm install playwright
npx playwright install chromium
# Exit code: 0

# Run desktop ARIA + GitHub link test
timeout 90 node qa-s5-final.mjs
# Exit code: 0

# Run long-press context menu test
timeout 30 node qa-lp3.mjs
# Exit code: 0
```
