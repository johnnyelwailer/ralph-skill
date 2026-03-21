# QA Log

## QA Session — 2026-03-21 (iteration 16)

### Test Environment
- Binary under test: /tmp/aloop-test-install-J1Ayxc/bin/aloop
- Version: 1.0.0
- Temp test dir: /tmp/qa-test-1774112669
- Isolated HOME: /tmp/aloop-test-home-qa-1774112669
- Features tested: 5

### Results
- PASS: CLI basics (--version, --help, no args, unknown command)
- PASS: aloop status (text + JSON output, provider health)
- PASS: aloop start (fresh start + resume)
- PASS: aloop dashboard (HTTP server, /api/state)
- PASS: aloop discover (spec detection, provider detection, mode recommendation)
- PASS: aloop stop / aloop steer (error handling)
- FAIL: README accuracy — documents wrong CLI flags for resume

### Bugs Filed
- [qa/P1] README documents `--launch-mode` and `--session-dir` but CLI uses `--launch` and positional session-id

### Command Transcript

```
=== CLI BASICS ===

$ aloop --version
1.0.0
EXIT CODE: 0

$ aloop --help
Usage: aloop [options] [command]
Aloop CLI for dashboard and project orchestration
[11 commands listed, all match README command table]
EXIT CODE: 0

$ aloop (no args)
[same help output]
EXIT CODE: 1

$ aloop nonexistent-command
error: unknown command 'nonexistent-command'
EXIT CODE: 1

=== STATUS ===

$ aloop status
Active Sessions:
  orchestrator-20260321-155413  pid=1627091  running  iter 47, queue  (1h ago)
  orchestrator-20260321-155413-issue-146-20260321-163402  pid=1816994  running  iter 16, qa
  orchestrator-20260321-155413-issue-166-20260321-165955  pid=1897697  running  iter 2, build
Provider Health:
  claude     healthy
  codex      healthy
  copilot    healthy
  gemini     cooldown     (220 failures, resumes in 41m)
  opencode   healthy
EXIT CODE: 0

$ aloop status --output json
[valid JSON with sessions[] and health{} objects]
EXIT CODE: 0

$ aloop status --json
error: unknown option '--json'
EXIT CODE: 1
(Note: --json is not a flag; correct syntax is --output json)

=== START ===

$ aloop start --max-iterations 1 --in-place --provider claude
Error: No Aloop configuration found for this project. Run `aloop setup` first.
EXIT CODE: 1
(Correct — no config yet)

$ aloop scaffold
{"config_path":"...config.yml","prompts_dir":"...prompts","project_dir":"...","project_hash":"188eccf4"}
EXIT CODE: 0

$ aloop start --max-iterations 1 --in-place --provider claude --output json
{"session_id":"qa-test-1774112669-20260321-170550",...,"dashboard_url":"http://localhost:33253"}
EXIT CODE: 0

$ aloop start qa-test-1774112669-20260321-170550 --launch resume --max-iterations 1 --output json
{"session_id":"qa-test-1774112669-20260321-170550",...,"launch_mode":"resume"}
EXIT CODE: 0

$ aloop start --launch-mode resume (README syntax)
error: unknown option '--launch-mode'
EXIT CODE: 1
*** BUG: README says --launch-mode but CLI only accepts --launch ***

$ aloop start --session-dir ~/.aloop/sessions/<id> (README syntax)
error: unknown option '--session-dir'
EXIT CODE: 1
*** BUG: README says --session-dir but CLI has no such flag ***

=== DASHBOARD ===

$ aloop dashboard --port 44444
Launching real-time progress dashboard on port 44444...
EXIT CODE: 0

$ curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:44444/
HTTP 200

$ curl -s http://localhost:44444/api/state
{"sessionDir":"...","status":null,"log":"","docs":{"TODO.md":"","SPEC.md":"..."}}

=== DISCOVER ===

$ aloop discover --output json
{"project":{"root":"/tmp/qa-test-1774112669","name":"qa-test-1774112669","is_git_repo":true},
 "context":{"spec_candidates":["SPEC.md","README.md"]},
 "providers":{"installed":["claude","opencode","codex","gemini","copilot"]},
 "mode_recommendation":{"recommended_mode":"loop"}}
EXIT CODE: 0

=== ERROR HANDLING ===

$ aloop stop
error: missing required argument 'session-id'
EXIT CODE: 1

$ aloop stop nonexistent-session-123
Session not found: nonexistent-session-123
EXIT CODE: 1

$ aloop steer
error: missing required argument 'instruction'
EXIT CODE: 1

$ aloop steer "focus on tests" --session nonexistent
Session not found: nonexistent
EXIT CODE: 1
```
