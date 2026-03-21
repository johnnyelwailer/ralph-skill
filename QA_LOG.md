# QA Log

## QA Session — 2026-03-21 (iteration 17)

### Test Environment
- Binary under test: /tmp/aloop-test-install-j0drY8/bin/aloop (v1.0.0)
- Dashboard port: 19876 (started with --session-dir and --workdir pointing to test fixtures)
- Test project dir: /tmp/qa-test-issue91-1774115497
- Test session dir: /tmp/qa-test-session-2145513
- Features tested: 5
- Browser: Playwright + Chromium (headless)
- Commit: 557b190

### Results
- PASS: GET /api/qa-coverage endpoint (happy path, missing file, no percentage, empty file, edge cases)
- PASS: QACoverageBadge color coding (green/yellow/red thresholds + boundaries)
- PASS: QACoverageBadge visibility (hidden when unavailable, shows N/A when no percentage)
- PASS: QACoverageBadge click-to-expand (markdown rendering, table, heading)
- PASS: Badge refresh on SSE state events (live update on status.json change)

### Bugs Filed
- None — all features working as specified

### Command Transcript

#### Test 1a: Endpoint happy path
```
$ curl -s http://localhost:19876/api/qa-coverage
{"percentage":75,"raw":"# QA Coverage\n\nCoverage: 75%\n...","available":true}
# Exit code: 0
```

#### Test 1b: Response shape validation
```
$ curl -s http://localhost:19876/api/qa-coverage | python3 -c "import json,sys; d=json.load(sys.stdin); ..."
All shape checks PASS
# Exit code: 0
```

#### Test 1c: Missing QA_COVERAGE.md
```
$ mv QA_COVERAGE.md QA_COVERAGE.md.bak
$ curl -s http://localhost:19876/api/qa-coverage
{"percentage":null,"raw":"","available":false}
# Exit code: 0
```

#### Test 1d: No percentage in file
```
$ echo "# QA Coverage\n\nNo percentage here." > QA_COVERAGE.md
$ curl -s http://localhost:19876/api/qa-coverage
{"percentage":null,"raw":"...","available":true}
# Exit code: 0
```

#### Test 1e: Edge cases (0%, 100%, lowercase)
```
# 0%: percentage=0 ✓
# 100%: percentage=100 ✓
# lowercase "coverage: 42%": percentage=42 ✓
```

#### Test 1f: Empty file
```
$ > QA_COVERAGE.md
$ curl -s http://localhost:19876/api/qa-coverage
{"percentage":null,"raw":"","available":false}
# available=false for empty file
```

#### Test 2: UI Badge with Playwright
```
$ node /tmp/qa-badge-test2.mjs
QA-related text matches: ["qa","qa","qa","qa","qa","qa","QA","75%"]
Found 75% text element at y=13 (header area)
```

#### Test 2b: Color coding at all thresholds
```
85% → green (border-green-500/40 bg-green-500/15 text-green-700) ✓
65% → yellow (border-yellow-500/40 bg-yellow-500/15 text-yellow-700) ✓
45% → red (border-red-500/40 bg-red-500/15 text-red-700) ✓
80% → green (boundary) ✓
60% → yellow (boundary) ✓
59% → red (boundary) ✓
```

#### Test 2c: Badge hidden when file missing
```
# Removed QA_COVERAGE.md → badge not visible in header ✓
# Header text: "Aloop Dashboard orchestrator-20260321... iter 5/∞ 0% build claude running Live"
```

#### Test 2d: No-percentage file shows N/A
```
# File exists without "Coverage: X%" → badge shows "QA N/A" ✓
```

#### Test 2e: Click-to-expand markdown rendering
```
# Click QA badge → prose-dashboard div appears with:
#   <h1>QA Coverage</h1>
#   <p>Coverage: 75%</p>
#   <table> with proper <thead>/<tbody> (GFM table rendering) ✓
# Prose element at x=518, y=41, 558x193px
```

#### Test 3: SSE refresh
```
# Initial: "QA 75%" (yellow)
# Changed QA_COVERAGE.md to 90%, updated status.json
# After 5s SSE wait: "QA 90%" (green) ✓
```

#### Screenshots
- /tmp/qa-dashboard-full.png — full page with badge visible
- /tmp/qa-badge-header.png — header closeup showing QA 75% badge
- /tmp/qa-badge-expanded-detail.png — expanded coverage view
- /tmp/qa-prose-detail.png — closeup of rendered markdown table

### Cleanup
- Test dashboard process killed
- Test project dir removed
- Test session dir removed
- Test install prefix removed
- Playwright test scripts removed
