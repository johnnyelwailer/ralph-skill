# QA Log

## QA Session — 2026-03-21 (iteration 20)

### Test Environment
- Binary under test: /tmp/aloop-test-install-sx80Uw/bin/aloop
- Version: 1.0.0
- Temp dir: /tmp/qa-test-1774133253
- Features tested: 5 (CLI help, status, discover, start/stop, resume)

### Results
- PASS: aloop --version, aloop --help, aloop status, aloop discover, aloop start, aloop stop, aloop start --launch resume, aloop steer error handling
- FAIL: README resume example (documentation bug)

### Bugs Filed
- [qa/P2] README documents `--launch-mode resume --session-dir` but actual CLI uses `--launch resume <session-id>`

### Command Transcript

```
$ /tmp/aloop-test-install-sx80Uw/bin/aloop --version
1.0.0
EXIT: 0

$ /tmp/aloop-test-install-sx80Uw/bin/aloop --help
Usage: aloop [options] [command]
(all 16 commands listed correctly)
EXIT: 0

$ /tmp/aloop-test-install-sx80Uw/bin/aloop nonexistent-command
error: unknown command 'nonexistent-command'
EXIT: 1

$ /tmp/aloop-test-install-sx80Uw/bin/aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=2754891  running  iter 70, verdict_extract  (5h ago)
  orchestrator-20260321-172932-issue-144-20260321-221308  pid=3001911  running  iter 20, qa
  orchestrator-20260321-172932-issue-126-20260321-224502  pid=3090583  running  iter 1, plan
Provider Health:
  claude=healthy, codex=healthy, copilot=healthy, gemini=cooldown(350 failures), opencode=healthy
EXIT: 0

$ /tmp/aloop-test-install-sx80Uw/bin/aloop status --output json
(valid JSON with sessions array and health object)
EXIT: 0

$ cd /tmp/qa-test-1774133253 && aloop discover
(valid JSON: detected node-typescript, found SPEC.md, recommended loop mode)
EXIT: 0

$ aloop discover --output text
Project: qa-test-1774133253 [74688d80]
Root: /tmp/qa-test-1774133253
EXIT: 0

$ aloop scaffold
(created config.yml and prompts at /home/pj/.aloop/projects/74688d80)
EXIT: 0

$ aloop start --provider claude --max-iterations 1 --output json
session_id: qa-test-1774133253-20260321-224759
pid: 3095696, worktree created, dashboard launched at http://localhost:40793
EXIT: 0

$ aloop status | grep qa-test
  qa-test-1774133253-20260321-224759  pid=3095696  running  iter 1, plan
EXIT: 0

$ aloop stop qa-test-1774133253-20260321-224759
Session qa-test-1774133253-20260321-224759 stopped.
EXIT: 0

$ aloop status | grep qa-test
(no output — session removed from active list)
EXIT: 0

$ aloop stop nonexistent-session-id
Session not found: nonexistent-session-id
EXIT: 1

$ aloop steer "test instruction"
Multiple active sessions. Specify one with --session: ...
EXIT: 1

$ aloop start --launch-mode resume --session-dir ~/.aloop/sessions/qa-test-1774133253-20260321-224759
error: unknown option '--launch-mode'
EXIT: 1
*** BUG: README documents --launch-mode but CLI uses --launch ***

$ aloop start --launch resume qa-test-1774133253-20260321-224759 --max-iterations 1 --output json
(resumed successfully, same session_id, launch_mode: "resume")
EXIT: 0

$ aloop stop qa-test-1774133253-20260321-224759
Session stopped.
EXIT: 0
```

### Cleanup
- Removed /tmp/qa-test-1774133253
- Removed session dir and project config
- Test install kept at /tmp/aloop-test-install-sx80Uw (cleanup deferred to end of QA agent)

## QA Session — 2026-03-22 (iteration 39)

### Test Environment
- Binary under test: /tmp/aloop-test-install-19sWf0/bin/aloop
- Version: 1.0.0
- Temp dir: /tmp/qa-test-1774137362
- Features tested: 5 (README resume re-test, start orchestrate dispatch, setup, orchestrate, dashboard)

### Results
- PASS: README resume example (re-test after fix), aloop start orchestrate dispatch, aloop setup, aloop orchestrate, aloop dashboard
- FAIL: none

### Bugs Filed
- None (all features working correctly)

### Previously Filed Bugs Re-tested
- [qa/P2] README resume example — FIXED and verified. README now correctly documents `--launch resume <session-id>`.

### Command Transcript

```
$ /tmp/aloop-test-install-19sWf0/bin/aloop --version
1.0.0
EXIT: 0

=== Test 1: README resume example re-test ===

$ grep resume README.md
aloop start --launch resume <session-id>
(README now shows correct syntax)

$ aloop scaffold
EXIT: 0

$ aloop start --provider claude --max-iterations 1 --output json
session_id: qa-test-1774137362-20260321-235644
EXIT: 0

$ aloop stop qa-test-1774137362-20260321-235644
Session stopped.
EXIT: 0

$ aloop start --launch resume qa-test-1774137362-20260321-235644 --max-iterations 1 --output json
launch_mode: "resume" — resumed successfully
EXIT: 0

$ aloop start --launch-mode resume --session-dir ...
error: unknown option '--launch-mode'
EXIT: 1
(old wrong syntax correctly rejected)

$ aloop stop qa-test-1774137362-20260321-235644
EXIT: 0

=== Test 2: aloop start orchestrate dispatch ===

$ sed -i "s/mode: 'plan-build-review'/mode: 'orchestrate'/" config.yml
$ aloop start --provider claude --output json
(dispatched to orchestrate mode — output includes orchestrator.json fields: waves, issues, concurrency_cap)
EXIT: 0

$ aloop start --provider claude --mode plan-build-review --max-iterations 1 --output json
(explicit --mode overrides config, mode: "plan-build-review" in output)
EXIT: 0

=== Test 3: aloop setup ===

$ aloop setup --help
(shows --non-interactive, --spec, --providers, --mode, --autonomy-level flags)
EXIT: 0

$ aloop setup --non-interactive --project-root /tmp/qa-setup-test-*
Setup complete. Config written to: .../config.yml
EXIT: 0
(config.yml and 6 prompt templates created)

$ aloop setup --non-interactive --spec CUSTOM_SPEC.md
(spec_files contains CUSTOM_SPEC.md — --spec flag works)
EXIT: 0

$ aloop setup --non-interactive --mode orchestrate
(config mode set to orchestrate)
EXIT: 0

$ aloop setup --non-interactive --providers claude,codex
EXIT: 0

$ aloop setup --non-interactive --mode invalid_mode
Error: Invalid setup mode: invalid_mode (must be loop or orchestrate)
EXIT: 1

=== Test 4: aloop orchestrate ===

$ aloop orchestrate --spec SPEC.md --plan-only --output json
(plan_only: true, pid: null — no daemon spawned)
EXIT: 0

$ aloop orchestrate --concurrency 5 --budget 25.00 --plan-only --output json
(concurrency_cap: 5, budget_cap: 25)
EXIT: 0

$ aloop orchestrate --issues 1,2,3 --plan-only --output json
(filter_issues: [1, 2, 3])
EXIT: 0

$ aloop orchestrate --trunk main --plan-only --output json
(trunk_branch: "main")
EXIT: 0

=== Test 5: aloop dashboard ===

$ aloop dashboard --help
(shows --port, --session-dir, --workdir, --assets-dir flags)
EXIT: 0

$ aloop dashboard --port 0
Error: Invalid port "0". Expected a number between 1 and 65535.
EXIT: 1

$ aloop dashboard --port 48765
(dashboard launched, HTTP 200 on /)
(SSE /events returns live state: iteration 39, phase qa, provider claude)
EXIT: 0 (after kill)

$ aloop dashboard --port 48766 --session-dir ~/.aloop/sessions/orchestrator-20260321-172932-issue-144-20260321-221308
(works with explicit --session-dir as documented in README)
EXIT: 0

$ aloop dashboard --port 48769 (port already in use)
Error: listen EADDRINUSE: address already in use :::48769
EXIT: 1
```

### Cleanup
- Removed /tmp/qa-test-1774137362
- Removed /tmp/aloop-test-install-19sWf0
- All temp setup dirs cleaned up
