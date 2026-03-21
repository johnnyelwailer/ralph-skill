# QA Log

## QA Session — 2026-03-22 (iteration 1)

### Binary Under Test
- Path: /tmp/aloop-test-install-8BAsgk/bin/aloop
- Version: 1.0.0

### Test Environment
- Temp dir: /tmp/qa-test-issue119-1774136071
- Dashboard port: 4051
- Features tested: 5
- Browser: Playwright + Chromium

### Feature Selection Rationale
Testing all acceptance criteria for Issue #119 (QA coverage percentage display from QA_COVERAGE.md). This is a new feature, never previously tested.

### Results
- PASS: QA coverage API endpoint (pipe-delimited table parsing)
- PASS: QA coverage missing file handling (returns error: "not_found")
- PASS: QA badge color coding (green/yellow/red thresholds)
- PASS: Expandable feature list (PASS/FAIL/UNTESTED labels)
- FAIL: QA badge display when QA_COVERAGE.md missing (badge hidden, not showing "0% or No QA data")

### Bugs Filed
- [qa/P1] QA badge hidden when QA_COVERAGE.md missing — spec says show "0% or No QA data"

### Detailed Command Transcript

#### 1. Install from source
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
ALOOP_BIN=/tmp/aloop-test-install-8BAsgk/bin/aloop

$ /tmp/aloop-test-install-8BAsgk/bin/aloop --version
1.0.0
```

#### 2. Set up test project
```
$ mkdir /tmp/qa-test-issue119-1774136071 && cd ... && git init && ...
# Created test project with QA_COVERAGE.md containing 5 features:
#   2 PASS, 1 FAIL, 2 UNTESTED (expected coverage: 60%)
```

#### 3. Start dashboard
```
$ aloop dashboard --port 4051
Launching real-time progress dashboard on port 4051...
```

#### 4. Test API endpoint
```
$ curl -s http://localhost:4051/api/qa-coverage | python3 -m json.tool
{
    "coverage_percent": 60,
    "total_features": 5,
    "tested_features": 3,
    "passed": 2,
    "failed": 1,
    "untested": 2,
    "features": [...],  // all 5 features with correct columns
    "available": true
}
# EXIT CODE: 0
# VERDICT: PASS — all fields match spec, coverage calculation correct
```

#### 5. Test missing file
```
$ mv QA_COVERAGE.md QA_COVERAGE.md.bak
$ curl -s http://localhost:4051/api/qa-coverage | python3 -m json.tool
{
    "coverage_percent": 0,
    "error": "not_found",
    "available": false,
    ...
}
# EXIT CODE: 0
# VERDICT: PASS — returns error: "not_found" per spec
```

#### 6. Test edge cases (empty table, no table)
```
# Empty table (header only): coverage_percent: 0, features: [] — PASS
# File with no table at all: coverage_percent: 0, features: [] — PASS (no parse_error returned, noted as known gap)
```

#### 7. Browser tests — QA badge color coding
```
# 60% coverage (yellow): Badge shows "QA 60%" with color rgb(161, 98, 7) — amber/yellow — PASS
# 100% coverage (green): Badge shows "QA 100%" with green styling — PASS
# 20% coverage (red): Badge shows "QA 20%" with red styling — PASS
# Screenshots: /tmp/qa-dashboard-full.png, /tmp/qa-dashboard-green.png, /tmp/qa-dashboard-red.png
```

#### 8. Browser test — expandable feature list
```
# Clicked QA badge → dropdown appeared with structured list:
#   - aloop start (CLI/start.ts) — PASS
#   - dashboard health (UI/HealthPanel) — FAIL
#   - aloop gh watch (CLI/gh.ts) — UNTESTED
#   - aloop setup (CLI/setup.ts) — PASS
#   - aloop stop (CLI/stop.ts) — UNTESTED
# All 5 features visible, PASS/FAIL/UNTESTED labels correct — PASS
# Screenshot: /tmp/qa-dashboard-expanded.png
```

#### 9. Browser test — missing file UI
```
# Removed QA_COVERAGE.md, reloaded dashboard
# QA badge completely hidden from top bar
# Spec says: "shows 0% or No QA data"
# VERDICT: FAIL — badge should be visible with "0%" or "No QA data" text
# Screenshot: /tmp/qa-dashboard-missing.png
```

### Cleanup
- Killed dashboard process
- Removed /tmp/qa-test-issue119-1774136071
- Removed /tmp/aloop-test-install-8BAsgk
- Removed screenshot files
