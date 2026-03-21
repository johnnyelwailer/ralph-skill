# QA Log

## QA Session — 2026-03-21 (iteration 16)

### Test Environment
- Binary under test: /tmp/aloop-test-install-dlMDHZ/bin/aloop
- Version: 1.0.0
- Commit: fbe350e
- Temp test dir: /tmp/qa-test-U4NcEK (cleaned up)
- Test session: qa-test-u4ncek-20260321-191724 (cleaned up)
- Features tested: 5 (CLI basics, status, discover, start/stop lifecycle, dashboard)

### Results
- PASS: aloop --version, --help, (no args), gh --help, start --help, orchestrate --help, devcontainer --help, update --help
- PASS: aloop status (shows sessions + provider health)
- PASS: aloop discover (detects spec, providers, language, recommends mode)
- PASS: aloop setup --non-interactive (creates config)
- PASS: aloop start (creates session/worktree/loop, appears in status)
- PASS: aloop stop (cleanly stops, removed from status)
- PASS: aloop steer (good error messages for nonexistent sessions)
- PASS: aloop dashboard (serves HTML, SSE /events delivers state data)
- FAIL: Dashboard REST API (all /api/* endpoints 404)
- FAIL: README resume syntax (--launch-mode and --session-dir flags don't exist)

### Bugs Filed
- [qa/P1] README resume syntax wrong — line 32 uses `--launch-mode` and `--session-dir` which don't exist in the CLI
- [qa/P1] Dashboard REST API endpoints all 404 — spec defines `GET /api/state?session=<id>` but no `/api/*` routes work

### Command Transcript

```
$ /tmp/aloop-test-install-dlMDHZ/bin/aloop --version
1.0.0
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop --help
Usage: aloop [options] [command]
(16 commands listed)
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop
(same help output)
EXIT: 1

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop gh --help
Usage: aloop gh [options] [command]
(13 subcommands listed)
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop status
Active Sessions: (4 orchestrator sessions listed)
Provider Health: claude=healthy, codex=healthy, copilot=healthy, gemini=cooldown(310 failures), opencode=healthy
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop discover --project-root /tmp/qa-test-U4NcEK
(JSON output with project info, spec_candidates=["SPEC.md","README.md"], providers installed=[claude,opencode,codex,gemini,copilot], mode_recommendation=loop)
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop setup --project-root /tmp/qa-test-U4NcEK --spec SPEC.md --providers claude --non-interactive
Running setup in non-interactive mode...
Setup complete. Config written to: /home/pj/.aloop/projects/819ebac1/config.yml
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop start --project-root /tmp/qa-test-U4NcEK --max-iterations 1 --provider claude --output json
{"session_id":"qa-test-u4ncek-20260321-191724","pid":2514581,"dashboard_url":"http://localhost:45623",...}
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop status
(5 sessions including qa-test-u4ncek-20260321-191724 running iter 1, plan)
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop stop qa-test-u4ncek-20260321-191724
Session qa-test-u4ncek-20260321-191724 stopped.
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop status | grep qa-test
(no output — session removed)
EXIT: 0

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop dashboard --port 14040
Launching real-time progress dashboard on port 14040...
EXIT: 0 (killed after test)

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:14040
200

$ curl -s -N -H "Accept: text/event-stream" http://localhost:14043/events
: connected
event: state
data: {"sessionDir":...,"status":{"iteration":1,"phase":"plan",...},...}

$ curl -s http://localhost:14042/api/status
{"error":"Not found"}
(All /api/* paths: /api/status, /api/session, /api/log, /api/events, /api/todos, /api/health → 404)

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop steer "test" --session nonexistent-session
Session not found: nonexistent-session
EXIT: 1

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop stop nonexistent-session
Session not found: nonexistent-session
EXIT: 1

$ /tmp/aloop-test-install-dlMDHZ/bin/aloop start invalid-session --launch resume
Error: Session not found: invalid-session. Cannot resume a non-existent session.
EXIT: 1
```

---

## QA Session — 2026-03-21 (iteration 33)

### Test Environment
- Binary under test: /tmp/aloop-test-install-DASfjL/bin/aloop
- Version: 1.0.0
- Commit: 4aa9423
- Temp test dir: /tmp/qa-test-88DWFV (cleaned up)
- Features tested: 4 (request validation, idempotency, post_comment dedup, process-requests error paths)

### Results
- FAIL: process-requests agent request validation — processAgentRequests never called
- FAIL: process-requests request ID idempotency — processed-ids.json never created
- FAIL: process-requests post_comment dedup — unreachable via CLI
- FAIL: process-requests nonexistent --session-dir — silently exits 0
- PASS: process-requests missing --session-dir flag — correctly errors
- PASS: process-requests empty requests dir — returns valid JSON
- PASS: aloop gh error handling — missing flags, nonexistent sessions all error correctly

### Bugs Filed
- [qa/P1] `process-requests` does NOT call `processAgentRequests` — all issue #179 validation/idempotency features unreachable
- [qa/P1] `process-requests` silently succeeds with nonexistent `--session-dir`

### Command Transcript

```
$ /tmp/aloop-test-install-DASfjL/bin/aloop --version
1.0.0
EXIT: 0

# Test 1: Invalid create_issues request (missing title field)
$ cat > requests/bad-create-issue.json
{"id":"test-bad-001","type":"create_issues","issues":[{"body":"This issue has no title"}]}

$ aloop process-requests --session-dir /tmp/qa-test-88DWFV/.aloop/sessions/test-orch --output json
{"iteration":1,"triage":{"processed_issues":0},"dispatched":0,...,"allDone":false}
EXIT: 0

$ ls requests/
bad-create-issue.json  (STILL PRESENT — not moved to failed/)
$ ls requests/failed/
ls: cannot access: No such file or directory
$ cat requests/processed-ids.json
No such file or directory

# Test 2: Valid post_comment request
$ cat > requests/valid-comment.json
{"id":"test-valid-001","type":"post_comment","issue_number":1,"body":"Test comment"}

$ aloop process-requests --session-dir ... --output json
(same output, no change — request file not processed)
EXIT: 0

# Test 3: Bogus request type
$ cat > requests/bogus-type.json
{"id":"test-bogus-001","type":"nonexistent_type","foo":"bar"}

$ aloop process-requests --session-dir ... --output json
(same output — bogus type not detected, not moved to failed/)
EXIT: 0

# Test 4: Nonexistent --session-dir
$ aloop process-requests --session-dir /tmp/totally-nonexistent-path
(no output)
EXIT: 0  ← BUG: should error

# Test 5: Missing --session-dir flag
$ aloop process-requests
error: required option '--session-dir <path>' not specified
EXIT: 1  ← PASS: correct error

# Test 6: Real orchestrator evidence
$ ls /home/pj/.aloop/sessions/orchestrator-20260321-172932/requests/ | wc -l
68  (68 unprocessed request files accumulating)
$ cat .../requests/processed-ids.json
No such file or directory
$ ls .../requests/failed/
No such file or directory

# Test 7: All child sessions have no processed-ids.json or failed/
(Checked 8 child sessions — none have processed-ids.json or requests/failed/)

# Test 8: aloop gh error handling
$ aloop gh pr-comment
error: required option '--session <id>' not specified
EXIT: 1

$ aloop gh pr-comment --session test-orch
error: required option '--request <file>' not specified
EXIT: 1

$ aloop gh pr-comment --session test-orch --request /tmp/nonexistent.json
{"event":"gh_operation_denied","reason":"Session config not found: ..."}
EXIT: 1
```
