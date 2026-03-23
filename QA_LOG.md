# QA Log

## QA Session — 2026-03-23 (iteration 7)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-gANwMQ/bin/aloop`
- Version: 1.0.0 (confirmed via `aloop --version`)
- Temp test dir: `/tmp/qa-test-hILtDv`, `/tmp/qa-test-1774250423`
- Commit: 4a1f8848
- Features tested: 5

### Results
- PASS: `aloop start --provider opencode` — P3 gap resolved, opencode accepted
- PASS: All 5 providers + round-robin accepted by CLI validation
- PASS: `aloop status` — lists sessions and provider health
- PASS: `aloop active` — lists running sessions
- PASS: `aloop scaffold` — creates project structure
- PASS: `aloop orchestrate --plan-only --output json` — starts correctly
- FAIL: `checkPrGates` unit tests (subtests 6 & 7) — stale expectations

### Bugs Filed
- [qa/P1] `checkPrGates` tests expect `'fail'` but implementation returns `'api_error'` for transient API errors (Issue #126 behavior change not reflected in tests)

### Command Transcript

```
$ /tmp/aloop-test-install-gANwMQ/bin/aloop --version
1.0.0
Exit: 0

$ aloop start --provider opencode 2>&1
Error: Project prompts not found: .../prompts. Run `aloop setup` first.
Exit: 1  [PASS — no "Invalid provider" error, validation passes]

$ aloop start --provider invalidprovider 2>&1
Error: Invalid provider: invalidprovider
Exit: 1  [PASS — correctly rejected]

$ for provider in claude openrouter copilot codex opencode gemini round-robin:
  claude     → PASS (accepted)
  openrouter → FAIL: "Invalid provider: openrouter" [EXPECTED — openrouter is not a standalone provider per README]
  copilot    → PASS (accepted)
  codex      → PASS (accepted)
  opencode   → PASS (accepted)
  gemini     → PASS (accepted)
  round-robin → PASS (accepted)

$ aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=578685  running  iter 20, queue  (51m ago)
  orchestrator-20260321-172932-issue-126-20260323-063244  pid=581249  running  iter 7, final-qa  (47m ago)
Provider Health:
  claude     healthy
  codex      healthy
  copilot    healthy
  gemini     cooldown
  opencode   healthy
Exit: 0  [PASS]

$ aloop active
(listed 2 active sessions with pids and workdirs)
Exit: 0  [PASS]

$ aloop scaffold (in fresh git repo with SPEC.md)
{"config_path":"...","prompts_dir":"...","project_dir":"...","project_hash":"89b41cbc"}
Exit: 0  [PASS — created .aloop/ and .opencode/ dirs]

$ npm test (in aloop/cli)
# tests 1020, pass 1004, fail 15, cancelled 0, skipped 1
Key Issue #126 failures:
  not ok 352/6 — "fails CI gate when workflows exist and check query errors"
    expected: 'fail', actual: 'api_error'
  not ok 352/7 — "handles gh errors gracefully for mergeability"
    expected: 'fail', actual: 'api_error'
```
