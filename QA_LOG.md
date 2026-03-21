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
