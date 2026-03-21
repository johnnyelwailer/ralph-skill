# QA Log

## QA Session — 2026-03-22

### Test Environment
- Binary under test: `/tmp/aloop-test-install-1U3KcH/bin/aloop` (version 1.0.0)
- Installed via: `npm --prefix aloop/cli run --silent test-install -- --keep`
- Dashboard port: 4343
- Test session dir: `/tmp/qa-cost-test-1774136110/.aloop-test-session`
- Test log.jsonl: 3 iteration_complete events with cost_usd (plan: $0.0034, build: $0.0125, review: $0.0078, total: $0.0237)
- Test meta.json: budget_cap_usd: 50.00, budget_warnings: [0.70, 0.85, 0.95]
- Features tested: 4
- Commit under test: b6260bb

### Results
- PASS: Cost API /api/cost/aggregate (graceful degradation)
- PASS: Cost API /api/cost/session/:id (graceful degradation)
- PASS: CostDisplay "Cost data unavailable" text (graceful degradation)
- PASS: SSE delivers cost data in log events
- FAIL: Per-session cost not displayed from log events (bug filed)
- FAIL: $X.XX / $Y.YY format with budget cap never renders (bug filed)
- FAIL: Color-coded cost progress bar never appears (bug filed)
- FAIL: Per-session cost/duration in sidebar cards/tooltips missing (bug filed)

### Bugs Filed
- [qa/P1] Per-session cost not displayed when opencode unavailable
- [qa/P1] No per-session cost or duration in sidebar session cards/tooltips
- [qa/P1] Cost progress bar (green/yellow/red) never renders

### Command Transcript

```
# Install CLI from source
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
/tmp/aloop-test-install-1U3KcH/bin/aloop

$ /tmp/aloop-test-install-1U3KcH/bin/aloop --version
1.0.0

# Create test project with budget config and log data
$ mkdir -p /tmp/qa-cost-test-1774136110 && cd /tmp/qa-cost-test-1774136110
$ git init && echo "# Test" > README.md && git add -A && git commit -m "init"
# Created meta.json with budget_cap_usd: 50.00
# Created log.jsonl with 3 iteration_complete events containing cost_usd

# Start dashboard
$ /tmp/aloop-test-install-1U3KcH/bin/aloop dashboard --port 4343 --session-dir /tmp/qa-cost-test-1774136110/.aloop-test-session
# Exit code: 0, dashboard running

# Test cost API aggregate
$ curl -s -w "\nHTTP:%{http_code}" http://localhost:4343/api/cost/aggregate
{"error":"opencode_unavailable"}
HTTP:200
# PASS: correct graceful degradation

# Test cost API session
$ curl -s -w "\nHTTP:%{http_code}" http://localhost:4343/api/cost/session/test-qa-session-1
{"error":"opencode_unavailable"}
HTTP:200
# PASS: correct graceful degradation

# Test cost API nonexistent session
$ curl -s -w "\nHTTP:%{http_code}" http://localhost:4343/api/cost/session/nonexistent
{"error":"opencode_unavailable"}
HTTP:200
# PASS: returns same graceful degradation (not a 404)

# Test SSE endpoint
$ timeout 3 curl -s -N http://localhost:4343/events
# Returns state event with full log.jsonl including usage.cost_usd fields
# PASS: cost data available to frontend via SSE

# Playwright tests
$ npx playwright screenshot --browser chromium http://localhost:4343 /tmp/qa-dashboard-overview.png
# Initial load: Shows "SPEND / Loading..." in header
# After SSE connects: Shows "Cost data unavailable" in muted box
# Progress bar at 80% visible — this is task progress, NOT cost progress
# No dollar amounts ($X.XX) visible anywhere on page
# FAIL: per-session cost from log events not displayed
# FAIL: cost progress bar not rendered
# FAIL: sidebar cards have no cost or duration

# Cleanup
$ kill <dashboard_pid>
$ rm -rf /tmp/qa-cost-test-1774136110
$ rm -rf /tmp/aloop-test-install-1U3KcH
```
