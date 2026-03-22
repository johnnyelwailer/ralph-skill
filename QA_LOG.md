# QA Log

## QA Session — 2026-03-22 (iteration 68)

### Test Environment
- Binary under test: /tmp/aloop-test-install-lvhl0b/bin/aloop v1.0.0
- Dashboard port: 4199 (started against test session, shows real sessions from ~/.aloop/sessions/)
- Test dir: /tmp/qa-cost-test-3790592
- Test session dir: /tmp/qa-cost-test-3790592/.aloop/sessions/qa-test-session
- Commit: 17ad170
- Features tested: 5

### Results
- PASS: Graceful degradation (no opencode), Per-session cost in sidebar
- PARTIAL: CostDisplay widget (degradation UI correct, but missing spend-vs-cap format)
- FAIL: Color-coded progress bar (yellow at 0%), Cost API (returns unavailable despite opencode installed), Budget cap display (not surfaced)

### Bugs Filed
- [qa/P1] Progress bar shows yellow at 0% spend (should be green)
- [qa/P1] Cost API returns "opencode_unavailable" when opencode IS installed
- [qa/P1] No spend-vs-cap display ($X.XX / $Y.YY) — budget cap not shown

### Command Transcript

#### Setup
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
/tmp/aloop-test-install-lvhl0b/bin/aloop

$ $ALOOP_BIN --version
1.0.0

$ $ALOOP_BIN dashboard --port 4199 --session-dir $SESSION_DIR &
Launching real-time progress dashboard on port 4199...
Exit code: 0
```

#### Test 1: Server-side cost API endpoints
```
$ curl -s http://localhost:4199/api/cost/aggregate
{"error":"opencode_unavailable"}
HTTP 200

$ curl -s http://localhost:4199/api/cost/session/qa-test-session
{"error":"opencode_unavailable"}
HTTP 200

$ curl -s http://localhost:4199/api/cost/session/nonexistent
{"error":"opencode_unavailable"}
HTTP 200
```
Note: opencode v1.2.25 IS installed at /usr/bin/opencode and `opencode db "SELECT 1"` returns 1 successfully. The server cannot use it — likely a query/table mismatch (opencode db table is `message`, not `messages`).

#### Test 2: Cost display widget (browser — Playwright)
```
$ node /tmp/qa-cost-browser-test2.mjs
Has dollar amounts: true
Has "cost" text: true
Has "unavailable" text: true
Has "budget" text: false
Progress bar elements found: 1
Cost-related elements found: 0
```
Screenshot: /tmp/qa-dashboard-cost-full.png
- Top bar shows: "Cost data unavailable" (muted text, rgb(107,114,128)) + "0%" + progress bar
- No $X.XX / $Y.YY format found
- Budget cap value not displayed

#### Test 3: Graceful degradation
```
$ which opencode
/usr/bin/opencode

$ grep -i "cost\|opencode\|error" /tmp/qa-dash-stderr.log
(no output — no errors in server logs)
```
PASS — API returns graceful JSON error, UI shows "Cost data unavailable" with muted styling, no crashes.

#### Test 4: Color-coded progress bar
```
$ node /tmp/qa-progress-bar-test.mjs
Progress bars with role="progressbar": 1
Progress bar 0: value=null, max=100, indicatorBg="rgb(234, 179, 8)"
```
Screenshot: /tmp/qa-topbar-cost.png
BUG: indicator is yellow (rgb(234,179,8)) at 0% spend. Spec says green < 70%.

#### Test 5: Per-session cost in sidebar
```
$ node /tmp/qa-sidebar-cost-test.mjs
All dollar amounts found: ["$0.0000","$0.0000","$0.0000","$0.0000"]
Non-zero costs: []
Session cost entries: ["iter 128· $0.0000","iter 39· $0.0000","iter 68· $0.0000","iter 17· $0.0000"]
```
Screenshot: /tmp/qa-sidebar-cost.png
Cost IS displayed per session (format: iter N · $X.XXXX). Shows $0.0000 because iteration_complete events in real logs have no cost_usd field.
