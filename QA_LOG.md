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

## QA Session — 2026-03-27 (issue-147 scan-diagnostics, re-test after lastSeenIteration+regressions fixes)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-WMQvmG/bin/aloop`
- Version: `1.0.0`
- Commit: `aca3bd052`
- Features tested: 4 (lastSeenIteration/current_iteration, test suite regressions, blockers.json {} compat, non-existent dir)

### Results
- PASS: lastSeenIteration/current_iteration correctly updates in standalone mode — **FIXED** (was FAIL at 82432eb7a)
- PASS: ALERT.md still fires at count=5 — still PASS
- PASS: stuck:true still written at count=5 — still PASS
- PASS: test suite — 1153/1154 pass, 0 fail — **FIXED** (17 pre-existing regressions resolved)
- FAIL: blockers.json {} init causes TypeError — tested at aca3bd052, still failing; retested at e67019313 — **FIXED**
- FAIL: non-existent session dir silently exits 0 — still open
- FAIL: --output json missing diagnostics — still open

### Bugs Filed
None — all failing behaviors already tracked in TODO.md.

### Command Transcript

```
# Binary: /tmp/aloop-test-install-WMQvmG/bin/aloop  (aca3bd052)
# Version: 1.0.0

# Test 1: lastSeenIteration / current_iteration in standalone mode
# loop-plan.json initial: {"iteration": 1}
# Run 1: exit 0, loop-plan.json.iteration → 2, blockers.json: lastSeenIteration=1, count=1
# Run 2: exit 0, loop-plan.json.iteration → 3, blockers.json: lastSeenIteration=2, count=2
# Run 3: exit 0, loop-plan.json.iteration → 4, blockers.json: lastSeenIteration=3, count=3
# Run 4: exit 0, loop-plan.json.iteration → 5, blockers.json: lastSeenIteration=4, count=4
# Run 5: exit 0, loop-plan.json.iteration → 6, blockers.json: lastSeenIteration=5, count=5
# diagnostics.json at count=5: current_iteration=5 ✓ (was 1 in prior session)
# ALERT.md: YES ✓, orchestrator.json stuck:true ✓

# Test 2: blockers.json {} init (aca3bd052)
# echo '{}' > $SESSION_DIR/blockers.json
# $ aloop process-requests --session-dir $SESSION_DIR
# [process-requests] diagnostics error: TypeError: existingRecords.map is not a function
# Exit: 0  ← BUG at aca3bd052

# Test 2b: blockers.json {} init re-test (e67019313)
# Binary: /tmp/aloop-test-install-kbQhm8/bin/aloop
# echo '{}' > $SESSION_DIR/blockers.json
# $ aloop process-requests --session-dir $SESSION_DIR
# Exit: 0, no error — blockers.json now correctly contains array ✓ — FIXED

# Test 3: test suite
# npm test → 1153/1154 pass, 0 fail, 1 skipped ✓

# Test 4: non-existent session dir
# $ aloop process-requests --session-dir /tmp/nonexistent-dir-xyz
# (no output), exit: 0  ← BUG — still unfixed
```

## QA Session — 2026-03-27 (issue-147 scan-diagnostics, re-test after ALERT.md+stuck fixes)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-RRsdh5/bin/aloop`
- Version: `1.0.0`
- Commit: `82432eb7a`
- Features tested: 4 (ALERT.md threshold, stuck flag, lastSeenIteration standalone, blockers.json {} init)

### Results
- PASS: ALERT.md fires at count=5 — **FIXED** (was count=10)
- PASS: stuck: true written at count=5 — **FIXED** (was never written)
- FAIL: lastSeenIteration/current_iteration stuck at 1 in standalone mode — still open qa/P1
- FAIL: blockers.json {} init causes TypeError — still open qa/P2
- FAIL: non-existent session dir silently exits 0 — still open
- FAIL: --output json missing diagnostics — still open

### Bugs Filed
None — all failing behaviors already tracked in TODO.md.

### Command Transcript

```
# Binary: /tmp/aloop-test-install-RRsdh5/bin/aloop
# Version: 1.0.0

# Test 1: ALERT.md + stuck:true at threshold (with loop-plan.json updates)
# loop-plan.json updated from iter=3 to iter=7 between runs
# Run 1 (iter=3): count=1, ALERT.md=NO, stuck=False
# Run 2 (iter=4): count=2, ALERT.md=NO, stuck=False
# Run 3 (iter=5): count=3, ALERT.md=NO, stuck=False
# Run 4 (iter=6): count=4, ALERT.md=NO, stuck=False
# Run 5 (iter=7): count=5, ALERT.md=YES ✓, stuck=True ✓
# diagnostics.json: current_iteration=7, first_seen_iteration=3 ✓ (correct!)

# Test 2: lastSeenIteration in standalone mode (no loop-plan.json updates)
# All 5 runs: lastSeenIteration=1, firstSeenIteration=1 ← BUG: stays at 1
# At run 5: diagnostics.json current_iteration=1 ← BUG (should be 5)
# ALERT.md=YES (fires at count=5) ✓, stuck=True ✓

# Test 3: blockers.json {} init
# echo '{}' > $SESSION_DIR/blockers.json
# $ aloop process-requests --session-dir $SESSION_DIR
# [process-requests] diagnostics error: TypeError: existingRecords.map is not a function
# Exit: 0  ← BUG: error swallowed

# Test 4: Non-existent session dir
# $ aloop process-requests --session-dir /tmp/nonexistent-session-qa-9999
# (no output)
# Exit: 0  ← BUG: should error

# Test 5: --output json (no diagnostics)
# Returns scan summary JSON without diagnostics field — still FAIL
```
## QA Session — 2026-03-27 (issue-147 scan-diagnostics, re-test after now-param + TS-cast fixes)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-7Bohdi/bin/aloop`
- Version: `1.0.0`
- Commit: `7bb514de3`
- Temp dir: `/tmp/qa-test-qB9kLO`
- Features tested: 4 (diagnostics.json writing after now-param removal, full test suite, non-existent dir error handling, --output json diagnostics)

### Results
- PASS: diagnostics.json writes correctly after `now` param removal — spec-compliant array, current_iteration=5, ALERT.md=YES, stuck=True — **still working**
- PASS: test suite — 1153/1154 pass, 0 fail — **still passing** after both recent fixes
- FAIL: non-existent session dir silently exits 0 — still open (re-confirmed at 7bb514de3)
- FAIL: --output json does not include diagnostics/blocker summary — still open (re-confirmed at 7bb514de3)

### Bugs Filed
None — both FAILs already tracked in QA_COVERAGE.md; no new bugs this session.

### Command Transcript

```
# Binary: /tmp/aloop-test-install-7Bohdi/bin/aloop  (7bb514de3)
# Version: 1.0.0

# Test 1: diagnostics.json writing (now param removed from writeDiagnosticsJson)
# Run 1-5: process-requests on fresh session, loop-plan.json starts at iter=1
# After run 5: loop-plan.json.iteration=6
# blockers.json: [{hash: "no_progress:...", count: 5, firstSeenIteration: 1, lastSeenIteration: 5}]
# diagnostics.json: [{type: "no_progress", current_iteration: 5, severity: "warning", ...}] ✓
# ALERT.md: YES ✓, orchestrator.json stuck: True ✓

# Test 2: Full test suite
# npm test --prefix aloop/cli
# 1153 pass, 0 fail, 1 skipped ✓

# Test 3: Non-existent session dir
# $ aloop process-requests --session-dir /tmp/nonexistent-dir-xyz-qa99
# (no output)
# Exit: 0  ← BUG — still unfixed

# Test 4: --output json missing diagnostics
# Run 5 iterations to trigger diagnostics, then:
# $ aloop process-requests --session-dir $SESSION_DIR2 --output json
# Returns: {iteration, triage, specQuestions, dispatched, queueProcessed, ...}
# Missing: diagnostics key, blockers key  ← BUG — still unfixed
```

## QA Session — 2026-03-27 (issue-147 scan-diagnostics, re-test after Gate2+Gate3 test strengthening)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-FmbhCg/bin/aloop`
- Version: `1.0.0`
- Commit: `b71a889a6`
- Temp dirs: `/tmp/qa-test-aD1LVE`, cleaned up
- Features tested: 4 (test suite Gate2+Gate3, non-existent dir, --output json diagnostics, cleanStaleSessions no-match branch)

### Results
- PASS: test suite — 1154 pass, 0 fail, 1 skipped — one more vs 1153: new cleanStaleSessions no-match test added
- PASS: cleanStaleSessions no-matching-child_session branch — orchestrator.json NOT rewritten — confirmed
- FAIL: non-existent session dir silently exits 0 — still open (re-confirmed at b71a889a6)
- FAIL: --output json does not include diagnostics/blocker summary — still open (re-confirmed at b71a889a6)

### Bugs Filed
None — both FAILs already tracked in QA_COVERAGE.md and TODO.md; no new bugs this session.

### Command Transcript

```
# Binary: /tmp/aloop-test-install-FmbhCg/bin/aloop  (b71a889a6)
# Version: 1.0.0

# Test 1: Full test suite after Gate2+Gate3 assertion strengthening
# npm test --prefix aloop/cli
# 1154 pass, 0 fail, 1 skipped (was 1153 pass — new cleanStaleSessions no-match test now running)

# Test 2: Non-existent session dir
# $ aloop process-requests --session-dir /tmp/nonexistent-dir-xyz-qa-b71a889
# (no output)
# Exit: 0  -- BUG: should error, still unfixed

# Test 3: --output json missing diagnostics
# Run 5 iterations on fresh session -> diagnostics.json written, stuck=True
# $ aloop process-requests --session-dir $SESSION_DIR --output json
# Returns: {iteration, triage, specQuestions, dispatched, ...} -- no diagnostics key -- BUG still unfixed

# Test 4: cleanStaleSessions no-matching-child_session branch
# orchestrator.json: issue #5 present, no child_session field
# $ aloop process-requests --session-dir $SESSION_DIR2
# Exit: 0, orchestrator.json after run: issues unchanged, no stale markers written
# changed stays false, orchestrator.json NOT rewritten -- PASS
```
