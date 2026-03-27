# QA Log

## QA Session — 2026-03-27 (issue-147 scan-diagnostics)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-oO3dtc/bin/aloop`
- Version: `1.0.0`
- Commit: `a854aa15c`
- Temp dir: `/tmp/qa-test-oyyHD1`
- Features tested: 5 (process-requests self-healing, blockers.json persistence, diagnostics.json escalation, ALERT.md, orchestrator.json stuck flag)

### Results
- PASS: blockers.json creation, blocker persistence, --output json, missing --session-dir error
- FAIL: diagnostics.json escalation threshold (3 not 5), diagnostics.json schema mismatch, ALERT.md threshold, stuck flag missing, silent exit on non-existent dir

### Bugs Filed
- [qa/P1] diagnostics.json: wrong escalation threshold (3 vs spec N=5 default)
- [qa/P1] diagnostics.json: schema mismatch — object not array, wrong field names, missing `severity` and per-blocker `suggested_fix`
- [qa/P2] orchestrator.json: `stuck: true` flag not written on escalation
- [qa/P2] process-requests: silent exit 0 on non-existent session dir
- [qa/P2] --output json: diagnostics/blocker info not included in JSON output

### Command Transcript

```
# Setup
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-oO3dtc/bin/aloop
$ALOOP_BIN --version
# → 1.0.0

# Test 1: process-requests on empty session
$ALOOP_BIN process-requests --session-dir /tmp/qa-test-oyyHD1
# exit: 0
# → blockers.json created with no_progress blocker (count=1)

# Test 6: Blocker persistence verified
# After iter=10: blockers.json shows firstSeenIteration=3, lastSeenIteration=10, count=11 ✓

# Test 14: Escalation threshold test (fresh session)
# Iter 1: count=1, diagnostics.json=NO, ALERT.md=NO
# Iter 2: count=2, diagnostics.json=NO, ALERT.md=NO
# Iter 3: count=3, diagnostics.json=YES, ALERT.md=NO  ← escalates at 3, not 5
# Iter 4: count=4, diagnostics.json=YES, ALERT.md=NO
# Iter 5: count=5, diagnostics.json=YES, ALERT.md=NO
# Iter 6: count=6, diagnostics.json=YES, ALERT.md=YES  ← ALERT at 6

# Test 12: diagnostics.json schema
# Actual:
# {
#   "updated_at": "...",
#   "blockers": [{ "hash": "...", "type": "...", "affectedIssue": null, "errorSnippet": "...",
#                  "firstSeenIteration": 3, "lastSeenIteration": 10, "count": 12 }],
#   "affected_issues": [],
#   "suggested_actions": ["Investigate no_progress for issue n/a: ..."]
# }
# Expected per spec: array of {type, message, first_seen_iteration, current_iteration, severity, suggested_fix}

# Test 15: orchestrator.json stuck flag
# grep stuck/paused from orchestrator.json → (nothing found) ✗

# Test 7: Missing --session-dir
$ALOOP_BIN process-requests
# exit: 1 — "error: required option '--session-dir <path>' not specified" ✓

# Test 8: Non-existent session dir
$ALOOP_BIN process-requests --session-dir /tmp/nonexistent-session-9999
# exit: 0, no output ✗ (should warn user)
```

## QA Session — 2026-03-27 (issue-147 scan-diagnostics, re-test after fixes)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-L1Lgdr/bin/aloop`
- Version: `1.0.0`
- Commit: `ea766e506`
- Temp dir: `/tmp/qa-test-XdmhSy`
- Features tested: 5 (diagnostics.json threshold+schema, lastSeenIteration, ALERT.md threshold, stuck flag, blockers.json backward compat)

### Results
- PASS: diagnostics.json threshold now 5 (was 3) — **FIXED**
- PASS: diagnostics.json schema is spec-compliant array format — **FIXED**
- FAIL: lastSeenIteration/current_iteration never updates (always 1) — new bug
- FAIL: ALERT.md written at count=10 (should be 5) — regression from prior session
- FAIL: stuck: true never written to orchestrator.json — still open
- FAIL: error handling (non-existent dir) silently exits 0 — still unfixed
- FAIL: --output json missing diagnostics/blocker summary — still unfixed
- FAIL: blockers.json initialized as {} causes TypeError — new bug

### Bugs Filed
- [qa/P1] lastSeenIteration never updates — `current_iteration` in diagnostics.json always wrong
- [qa/P1] ALERT.md written at count=10 instead of N=5
- [qa/P1] stuck: true never written (re-confirmed; already tracked as review/Gate1)
- [qa/P2] blockers.json {} init causes TypeError: existingRecords.map is not a function

### Command Transcript

```
# Install
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Binary: /tmp/aloop-test-install-L1Lgdr/bin/aloop
# Version: 1.0.0

# Error handling: non-existent dir
$ /tmp/aloop-test-install-L1Lgdr/bin/aloop process-requests --session-dir /nonexistent/path
# (no output)
# Exit: 0  ← BUG: should error

# blockers.json {} init bug
$ echo '{}' > $SESSION_DIR/blockers.json
$ /tmp/aloop-test-install-L1Lgdr/bin/aloop process-requests --session-dir $SESSION_DIR
# [process-requests] diagnostics error: TypeError: existingRecords.map is not a function
# Exit: 0 (error swallowed)

# Fresh run (no blockers.json):
$ /tmp/aloop-test-install-L1Lgdr/bin/aloop process-requests --session-dir $SESSION_DIR
# blockers.json created with count=1, firstSeenIteration=1, lastSeenIteration=1

# Iterations 2-5:
# count=3: diagnostics.json NOT created (threshold now correctly 5)
# count=5: diagnostics.json CREATED ← FIXED (was 3)
# lastSeenIteration=1 throughout all iterations ← BUG: should track last iteration seen

# Iterations 6-10:
# count=10: ALERT.md CREATED ← BUG: should be at count=5
# stuck: NOT SET in orchestrator.json ← BUG throughout

# diagnostics.json schema at count=5:
# [{"type":"no_progress","message":"No issues dispatched or triaged",
#   "first_seen_iteration":1,"current_iteration":1,   ← BUG: current_iteration should be 5
#   "severity":"warning","suggested_fix":"Investigate no_progress:..."}]

# JSON output mode (no diagnostics):
$ /tmp/aloop-test-install-L1Lgdr/bin/aloop process-requests --session-dir $SESSION_DIR2 --output json
# Returns scan summary without diagnostics/blocker data ← still FAIL
```
