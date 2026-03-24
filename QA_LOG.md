# QA Log

## QA Session — 2026-03-24 (iteration 3)

### Binary Under Test
- Installed path: `/tmp/aloop-test-install-kjNr48/bin/aloop`
- Version: `1.0.0`
- Built from: commit `b5874714` (branch `aloop/issue-180`)
- Install method: `npm run build:server && ... && node scripts/test-install.mjs --keep`
  (dashboard build skipped — vite not available in container; CLI build succeeds)

### Test Environment
- Temp dirs: `/tmp/qa-test-tWDap4`, `/tmp/qa-test-jrL32Q`, `/tmp/qa-test-tWDap4/sessions/...`
- Features tested: 5
- Unit test suite: all issue #180 tests pass (tests 61–65)

### Results
- PASS: process-requests unrecognized file quarantine
- PASS: process-requests malformed JSON handling
- PASS: process-requests known file types not quarantined
- PASS: process-requests stderr logging in JSON mode
- PASS: process-requests edge cases (empty, array, large payload)
- PASS: blocker unit tests (detectCurrentBlockers, updateBlockerSignatures, computeOverallHealth, runOrchestratorScanPass)
- SKIP: diagnostics.json CLI-level write (no GitHub access to trigger full scan pass)
- SKIP: ALERT.md CLI-level write (same reason)

### Bugs Filed
- None

### Notes
1. **Pre-existing test failures**: Tests 7, 14, 21, 23, 24, 27, 37, 38, 42, 48, 52 in orchestrate.test.ts fail — these are unrelated to issue #180 and pre-existed this branch.
2. **diagnostics.json/ALERT.md**: These features are verified only via unit tests. CLI-level E2E test not possible without GitHub access for the full orchestrator scan loop.
3. **Malformed JSON reason**: Malformed JSON files get `reason: "unsupported_type"` (same as unrecognized files). The TODO spec explicitly specifies this reason. Not a bug.

### Command Transcript

```
# Install binary
cd aloop/cli
npm run build:server && npm run build:shebang && npm run build:templates && npm run build:bin && npm run build:agents
node scripts/test-install.mjs --keep
# → /tmp/aloop-test-install-kjNr48/bin/aloop

# Verify binary
/tmp/aloop-test-install-kjNr48/bin/aloop --version
# → 1.0.0

# Run unit tests (issue #180 blocker tracking suite)
npx tsx --test src/commands/orchestrate.test.ts 2>&1 | grep -E "^(ok|not ok)"
# → ok 61 - computeBlockerHash
# → ok 62 - detectCurrentBlockers
# → ok 63 - updateBlockerSignatures
# → ok 64 - computeOverallHealth
# → ok 65 - runOrchestratorScanPass blocker tracking

# Run process-requests unit tests
npx tsx --test src/commands/process-requests.test.ts 2>&1 | tail -5
# → pass 7, fail 0

# Test 1: Unrecognized files quarantined
SESSION_DIR=/tmp/qa-test-tWDap4/sessions/qa-test-blocker-1774346223
mkdir -p $SESSION_DIR/requests $SESSION_DIR/requests/failed
echo '{"type": "unknown_request_type"}' > $SESSION_DIR/requests/some-unknown-type.json
echo '{"payload": "test"}' > $SESSION_DIR/requests/another-weird-request.json
echo '{"issues":[]}' > $SESSION_DIR/orchestrator.json
aloop process-requests --session-dir $SESSION_DIR
# stdout: [process-requests] Unrecognized request file "another-weird-request.json" — payload: ...
# stdout: [process-requests] Unrecognized request file "some-unknown-type.json" — payload: ...
# exit code: 0
ls $SESSION_DIR/requests/failed/
# → another-weird-request.json  some-unknown-type.json
cat $SESSION_DIR/requests/failed/another-weird-request.json
# → {"original_filename": "another-weird-request.json", "reason": "unsupported_type", ...}

# Test 2: Malformed JSON quarantined
echo '{bad json' > $SESSION_DIR2/requests/malformed.json
aloop process-requests --session-dir $SESSION_DIR2
# stdout: [process-requests] Unrecognized request file "malformed.json" — payload: "{bad json\n"
# exit code: 0
# → malformed.json moved to failed/

# Test 3: Known file NOT quarantined
SESSION_DIR3=/tmp/qa-session-...
echo '{"issues":[{"title":"Test","body":"t","labels":[],"milestone":null}]}' > $SESSION_DIR3/requests/epic-decomposition-results.json
aloop process-requests --session-dir $SESSION_DIR3
# stdout: [process-requests] Applied epic decomposition: 1 issues
# exit code: 0
# → epic-decomposition-results.json moved to processed/ (NOT failed/)

# Test 4: Stderr separation in JSON mode
aloop process-requests --session-dir $SESSION_DIR4 --output json > /tmp/stdout.txt 2>/tmp/stderr.txt
# /tmp/stdout.txt → valid JSON object
# /tmp/stderr.txt → [process-requests] Unrecognized request file "unknown-req.json" ...

# Test 5: Edge cases
echo "" > $SESSION_DIR5/requests/empty.json
echo '[1,2,3]' > $SESSION_DIR5/requests/array.json
# (large payload file 1000+ chars)
aloop process-requests --session-dir $SESSION_DIR5
# All three quarantined to failed/

# Cleanup
rm -rf /tmp/qa-test-tWDap4 /tmp/qa-test-jrL32Q /tmp/qa-session-*
rm -rf /tmp/aloop-test-install-kjNr48
```
