# QA Log

## QA Session — 2026-03-22 (iteration 34)

### Test Environment
- Binary under test: /tmp/aloop-test-install-pxzXX6/bin/aloop
- Version: 1.0.0
- Installed via: npm --prefix aloop/cli run test-install --keep
- Temp test dir: /tmp/qa-test-DpWZlM
- Features tested: 5 (CLI basics, status, start/stop lifecycle, dashboard, discover)

### Results
- PASS: aloop --version, aloop --help, aloop status, aloop scaffold, aloop start, aloop active, aloop discover, aloop steer (multi-session error), aloop dashboard (HTML + SSE), aloop orchestrate --help, aloop gh --help
- FAIL: aloop stop (misleading error for stopped sessions)

### Bugs Filed
- [qa/P2] aloop stop says "Session not found" for stopped sessions

### Command Transcript

```
$ /tmp/aloop-test-install-pxzXX6/bin/aloop --version
1.0.0
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop --help
Usage: aloop [options] [command]
(lists all commands including: resolve, discover, setup, scaffold, start, dashboard, status, active, stop, update, devcontainer, devcontainer-verify, orchestrate, steer, process-requests, gh)
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=2754891  running  iter 92, orch_scan  (6h ago)
  ...4 more child sessions listed...
Provider Health:
  claude     healthy      (last success: 25s ago)
  codex      healthy      (last success: 10m ago)
  copilot    healthy      (last success: 3m ago)
  gemini     cooldown     (390 failures, resumes in 51m)
  opencode   healthy      (last success: 3m ago)
EXIT: 0

$ cd /tmp/qa-test-DpWZlM && /tmp/aloop-test-install-pxzXX6/bin/aloop scaffold
{"config_path":"/home/pj/.aloop/projects/763a3145/config.yml","prompts_dir":"/home/pj/.aloop/projects/763a3145/prompts","project_dir":"/home/pj/.aloop/projects/763a3145","project_hash":"763a3145"}
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop start --max-iterations 1 --provider claude --output json
{"session_id":"qa-test-dpwzlm-20260321-234326","session_dir":"/home/pj/.aloop/sessions/qa-test-dpwzlm-20260321-234326",...,"dashboard_url":"http://localhost:35571","warnings":[]}
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop active
orchestrator-20260321-172932  pid=2754891  running  /Users/pj/Dev/ralph-skill
...4 more sessions listed...
(test session already stopped — not listed, correct behavior)
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop stop qa-test-dpwzlm-20260321-234326
Session not found: qa-test-dpwzlm-20260321-234326
EXIT: 1

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:35571/
200

$ timeout 3 curl -s -N http://localhost:35571/events
: connected
event: state
data: {...full state JSON with sessionDir, status, log, docs, activeSessions, recentSessions, artifacts, meta...}
event: heartbeat
data: {"timestamp":"2026-03-21T23:44:26.718Z"}

$ /tmp/aloop-test-install-pxzXX6/bin/aloop discover --output json
{"project":{"root":"/tmp/qa-test-DpWZlM","name":"qa-test-DpWZlM",...},"providers":{"installed":["claude","opencode","codex","gemini","copilot"]},...,"mode_recommendation":{"recommended_mode":"loop",...}}
EXIT: 0

$ /tmp/aloop-test-install-pxzXX6/bin/aloop steer "test instruction"
Multiple active sessions. Specify one with --session: orchestrator-20260321-172932, ...
EXIT: 1

$ /tmp/aloop-test-install-pxzXX6/bin/aloop gh --help
(lists all subcommands: start, watch, status, stop, pr-create, pr-comment, issue-comment, issue-create, issue-close, issue-label, pr-merge, branch-delete, issue-comments, pr-comments)
EXIT: 0
```

### Cleanup
- Removed /tmp/aloop-test-install-pxzXX6
- Removed /tmp/qa-test-DpWZlM
- Removed /home/pj/.aloop/sessions/qa-test-dpwzlm-20260321-234326
- Removed /home/pj/.aloop/projects/763a3145

## QA Session — 2026-03-22 (iteration 35) — BLOCKED

### Test Environment
- Could not set up test environment — shell completely non-functional
- Every Bash command fails with exit code 134 (SIGABRT) or exit code 1, including `/bin/true` and `echo test`
- Likely cause: container OOM or resource exhaustion

### Planned Test Targets
1. **aloop stop** (re-test previous FAIL) — verify if "Session not found" bug is fixed for already-stopped sessions
2. **aloop steer** (actual steering) — test steering a real session, not just the multi-session error message
3. **aloop update** (never tested) — test update command behavior
4. **aloop setup** (never tested) — test interactive setup flow

### Results
- BLOCKED: 0 features tested. Shell environment is non-functional — cannot execute any commands.

### Bugs Filed
- None (could not test)

### Notes
- Previous QA session (iteration 34) results still stand: 11/12 PASS, 1 FAIL (aloop stop misleading error)
- The FAIL bug `[qa/P2] aloop stop misleading error for stopped sessions` remains open in TODO.md — could not re-test
- Recommend re-running QA once container resources are available
