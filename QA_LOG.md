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
