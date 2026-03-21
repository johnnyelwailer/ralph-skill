# QA Log

## QA Session — 2026-03-21 (iteration 16)

### Test Environment
- Binary under test: /tmp/aloop-test-install-j3PxgH/bin/aloop
- Version: 1.0.0
- Dashboard port: 4242 (session: orchestrator-20260321-172932)
- Viewport: 1920x1080 (desktop)
- Browser: Chromium (Playwright)
- Features tested: 5

### Results
- PASS: Dashboard rendering, SessionCard, SessionList, Sidebar toggle, Session switching, URL params, Layout, Header, Footer, Helpers
- FAIL: Session card branch name (missing), Session grouping labels (wrong terminology), Force stop button (missing)

### Bugs Filed
- [qa/P1] Session card branch name not displayed
- [qa/P1] Session grouping uses "RECENT" instead of spec's "Active"/"Older (N)"
- [qa/P1] Force stop (SIGKILL) button missing from footer

### Command Transcript

```bash
# Install CLI from source
$ npm --prefix aloop/cli run --silent test-install -- --keep
# Output: ✓ test-install passed (prefix kept at /tmp/aloop-test-install-j3PxgH)
# Exit code: 0

$ /tmp/aloop-test-install-j3PxgH/bin/aloop --version
# Output: 1.0.0
# Exit code: 0

# Launch dashboard
$ /tmp/aloop-test-install-j3PxgH/bin/aloop dashboard --port 4242 --session-dir /home/pj/.aloop/sessions/orchestrator-20260321-172932
# Output: Launching real-time progress dashboard on port 4242...
# Exit code: 0 (running in background)

# Verify HTTP response
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4242
# Output: 200
# Exit code: 0
```

#### Playwright Tests

**Test 1: Dashboard renders**
- Navigated to http://localhost:4242
- Page body length: 1842 chars
- Sidebar elements found: 1
- Card elements found: 3
- 17 session items in sidebar
- No console errors on reload
- Screenshot: /tmp/qa-dashboard-desktop.png
- RESULT: PASS

**Test 2: Session card details**
- Cards show: session name, status dot, elapsed time (e.g., "59m ago"), phase (queue/build/qa/plan), iteration count (e.g., "iter 16")
- Card fields verified via text parsing: hasIterCount=true, hasTimeAgo=true, hasPhaseName=true
- Branch name NOT present in any card text
- RESULT: PASS for extracted component fields; FAIL for branch name

**Test 3: Session list grouping**
- Project group "RALPH-SKILL" visible at top
- Orchestrator group "ORCHESTRATOR-20260321-172932" visible with child sessions
- "RECENT" section visible with older sessions
- Spec requires "Active" and "Older (N)" groups — not present
- RESULT: PASS for grouping functionality; FAIL for label compliance

**Test 4: Sidebar toggle (Ctrl+B)**
- Before: Sidebar visible at 256px width
- After Ctrl+B: Sidebar collapses to icon-only bar with colored status dots stacked vertically
- After second Ctrl+B: Sidebar expands back to full width
- Screenshots: /tmp/qa-sidebar-before.png, /tmp/qa-sidebar-after.png
- RESULT: PASS

**Test 5: Session switching**
- Clicked orchestrator parent session → header updated to "orchestrator-20260321..." iter 16
- Clicked issue-154 session → header updated, activity log refreshed, docs panel showed TODO/SPEC/RESEARCH/Health tabs
- URL updated to ?session=orchestrator-20260321-172932-issue-154-20260321-181044
- Screenshot: /tmp/qa-session-switched.png, /tmp/qa-issue154-selected.png
- RESULT: PASS

**Test 6: Layout verification (1920x1080)**
- Top-level: flex column with 2 children
- Sidebar: 256px wide, full height
- Main area: 1664px wide, 988px height
- Header: 43px height, contains iter/progress/phase/provider/status/connection/CtrlK
- Footer: Steer textarea + Send + Stop buttons
- Docs panel: Has tabs (TODO, SPEC, RESEARCH, Health)
- Activity panel: Shows event count, date grouping
- RESULT: PASS

**Test 7: Force stop button**
- Only "Stop" button found in footer
- No "Force" button, no dropdown with SIGKILL option
- Spec requires: "[Stop (SIGTERM)] [Force (SIGKILL)]"
- RESULT: FAIL

**Test 8: API endpoints**
- /api/state: 200 OK
- /api/sessions: 404 Not Found
- RESULT: PARTIAL (state works, sessions endpoint missing)
```
