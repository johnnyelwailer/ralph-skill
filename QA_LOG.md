# QA Log

## QA Session — 2026-03-22 (iteration 36)

### Test Environment
- Binary under test: /tmp/aloop-test-install-9yteTr/bin/aloop
- Version: 1.0.0
- Temp test project: /tmp/qa-test-session2
- Features tested: 5

### Results
- PASS: aloop steer, aloop stop, aloop dashboard, aloop scaffold, aloop discover (happy paths)
- FAIL: aloop discover --project-root /nonexistent (bug filed)

### Bugs Filed
- [qa/P2] `aloop discover --project-root /nonexistent` returns exit 0 with empty results instead of error

### Observations
- `aloop steer` with empty string `""` is accepted as a valid instruction — should arguably be rejected
- `aloop steer --affects-completed-work invalid` is not validated (invalid values accepted without error)
- `aloop stop ""` gives "Session not found: " with trailing colon — minor cosmetic issue
- `aloop scaffold --project-root /nonexistent/path` gives raw Node.js EACCES error instead of user-friendly message
- `aloop dashboard` takes ~5s to start listening — slow but functional
- `aloop dashboard` SSE `/events` endpoint streams full state including TODO.md, SPEC content — works well
- `aloop discover` mode recommendation feature works well — recommends "loop" for small projects, shows reasoning

### Command Transcript

#### Feature 1: aloop steer

```
$ aloop steer
error: missing required argument 'instruction'
EXIT: 1
```

```
$ aloop steer "test instruction" --session nonexistent-session
Session not found: nonexistent-session
EXIT: 1
```

```
$ aloop steer "test instruction" --session nonexistent-session --output json
{"success":false,"error":"Session not found: nonexistent-session"}
EXIT: 1
```

```
$ aloop steer "focus on tests"
Multiple active sessions. Specify one with --session: orchestrator-20260321-172932, ...
EXIT: 1
```

```
$ aloop steer ""
Multiple active sessions. Specify one with --session: ...
EXIT: 1
(empty string accepted as instruction — should arguably be rejected)
```

#### Feature 2: aloop stop

```
$ aloop stop
error: missing required argument 'session-id'
EXIT: 1
```

```
$ aloop stop nonexistent-session-id
Session not found: nonexistent-session-id
EXIT: 1
```

```
$ aloop stop nonexistent-session-id --output json
{"success":false,"reason":"Session not found: nonexistent-session-id"}
EXIT: 1
```

```
$ aloop stop ""
Session not found:
EXIT: 1
```

#### Feature 3: aloop dashboard

```
$ aloop dashboard --port 4996
Launching real-time progress dashboard on port 4996...
Session dir: /home/pj/.aloop/sessions/.../worktree
Workdir: /home/pj/.aloop/sessions/.../worktree
Assets dir: /tmp/aloop-test-install-9yteTr/lib/node_modules/aloop-cli/dist/dashboard
(listening on port 4996 after ~5s, HTTP 200)
```

```
$ curl http://localhost:4996
<!DOCTYPE html><html lang="en">...
(serves dashboard frontend HTML)
```

```
$ curl http://localhost:4996/events
: connected
event: state
data: {"sessionDir":"...","status":null,"log":"","docs":{"TODO.md":"..."},...}
(SSE endpoint works, streams full state)
```

```
$ curl http://localhost:4996/api/status
{"error":"Not found"}
(API endpoints return 404 — dashboard uses SSE, not REST API)
```

#### Feature 4: aloop scaffold

```
$ cd /tmp/qa-test-session2 && aloop scaffold --provider claude --spec-files README.md --output json
{"config_path":"/home/pj/.aloop/projects/920150a7/config.yml","prompts_dir":"...","project_dir":"...","project_hash":"920150a7"}
EXIT: 0
```

```
$ aloop scaffold --output text
Wrote config: /home/pj/.aloop/projects/920150a7/config.yml
Wrote prompts: /home/pj/.aloop/projects/920150a7/prompts
EXIT: 0
```

```
$ aloop scaffold --project-root /nonexistent/path --output json
Error: EACCES: permission denied, mkdir '/nonexistent'
EXIT: 1
(raw Node.js error, not user-friendly)
```

```
$ aloop scaffold --project-root /tmp/qa-test-session2 --language typescript --provider codex --output json
{"config_path":"...","prompts_dir":"...","project_dir":"...","project_hash":"920150a7"}
EXIT: 0
(overrides applied correctly)
```

#### Feature 5: aloop discover

```
$ cd /tmp/qa-test-session2 && aloop discover
{"project":{"root":"/tmp/qa-test-session2","name":"qa-test-session2","hash":"920150a7","is_git_repo":true,"git_branch":"master"},"setup":{...},"context":{"detected_language":"other","language_confidence":"low",...,"spec_candidates":["README.md"],...},"providers":{"installed":["claude","opencode","codex","gemini","copilot"],...},"mode_recommendation":{"recommended_mode":"loop","reasoning":[...]}}
EXIT: 0
```

```
$ aloop discover --output text
Project: qa-test-session2 [920150a7]
Root: /tmp/qa-test-session2
Detected language: other (low)
Providers installed: claude, opencode, codex, gemini, copilot
Spec candidates: README.md
EXIT: 0
```

```
$ aloop discover --project-root /nonexistent
{"project":{"root":"/nonexistent","name":"nonexistent","hash":"3969afb7","is_git_repo":false,"git_branch":null},...,"spec_candidates":[],...}
EXIT: 0
(BUG: returns exit 0 for nonexistent path, should error)
```

---

## QA Session — 2026-03-22 (iteration 35)

### Test Environment
- Binary under test: /tmp/aloop-test-install-rGCPIQ/bin/aloop
- Version: 1.0.0
- Temp test project: /tmp/qa-test-1774183630
- Features tested: 5

### Results
- PASS: aloop --version, aloop --help, aloop status, aloop status --watch, aloop start --mode orchestrate forwarding, aloop gh subcommands, aloop start error handling
- FAIL: aloop start --mode orchestrate --output json (bug filed)

### Bugs Filed
- [qa/P2] `--output json` flag ignored when `aloop start --mode orchestrate` forwards to orchestrateCommand

### Observations
- `aloop status --watch` is marked as `[ ]` (unimplemented) in TODO.md but actually works — TODO is stale
- `aloop gh` bare command exits 1 while `aloop gh --help` exits 0 (both show identical help text) — minor UX inconsistency, not filed as bug

### Command Transcript

#### Feature 1: aloop --version / --help

```
$ aloop --version
1.0.0
EXIT: 0
```

```
$ aloop --help
Usage: aloop [options] [command]
Aloop CLI for dashboard and project orchestration
Options:
  -V, --version                  output the version number
  -h, --help                     display help for command
Commands:
  resolve, discover, setup, scaffold, start, dashboard, status, active, stop,
  update, devcontainer, devcontainer-verify, orchestrate, steer, process-requests, gh, help
(17 commands shown — spec says default should be 6, known TODO)
EXIT: 0
```

```
$ aloop --help --all
(identical output to --help — --all flag has no effect yet, expected per TODO)
EXIT: 0
```

```
$ aloop nonexistent-command
error: unknown command 'nonexistent-command'
EXIT: 1
```

#### Feature 2: aloop status

```
$ aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=2754891  running  iter 389, orch_scan  (19h ago)
  orchestrator-20260321-172932-issue-166-20260322-090309  pid=421610  running  iter 87, build  (3h ago)
  orchestrator-20260321-172932-issue-174-20260322-110342  pid=1543110  running  iter 35, qa  (1h ago)
  orchestrator-20260321-172932-issue-111-20260322-110610  pid=1575183  running  iter 4, build  (1h ago)
  orchestrator-20260321-172932-issue-101-20260322-110611  pid=1576107  completed  iter 41, spec-gap  (1h ago)
  orchestrator-20260321-172932-issue-81-20260322-110612  pid=1577099  running  iter 39, build  (1h ago)

Provider Health:
  claude     healthy      (last success: 17s ago)
  codex      healthy      (last success: 12m ago)
  copilot    healthy      (last success: 1m ago)
  gemini     cooldown     (917 failures, resumes in 49m)
  opencode   healthy      (last success: 1m ago)
EXIT: 0
```

```
$ aloop status --json
error: unknown option '--json'
EXIT: 0
(--json not in spec for status command, not a bug)
```

```
$ aloop status --watch
(auto-refreshes every 2s with ANSI clear codes, shows same session/health data)
(killed after 3s via timeout)
EXIT: 124 (timeout)
```

#### Feature 3: aloop gh subcommands

```
$ aloop gh
Usage: aloop gh [options] [command]
Policy-enforced GitHub operations
Commands: start, watch, status, stop, pr-create, pr-comment, issue-comment,
  issue-create, issue-close, issue-label, pr-merge, branch-delete,
  issue-comments, pr-comments
EXIT: 1
```

```
$ aloop gh --help
(identical output)
EXIT: 0
```

```
$ aloop gh start --help
Options:
  --issue <number>, --spec <path>, --provider <provider>, --max <number>,
  --repo <owner/repo>, --project-root <path>, --home-dir <path>, --output <mode>
EXIT: 0
```

```
$ aloop gh start
error: required option '--issue <number>' not specified
EXIT: 1
```

```
$ aloop gh pr-create
error: required option '--session <id>' not specified
EXIT: 1
```

```
$ aloop gh branch-delete --session fake-session --branch test-branch
error: required option '--request <file>' not specified
EXIT: 1
```

#### Feature 4: aloop start --mode orchestrate (forwarding)

```
$ cd /tmp/qa-test-1774183630 && aloop start --mode orchestrate
[orchestrate] filter_repo derive via gh repo view --json nameWithOwner failed: gh: blocked by aloop PATH hardening
[orchestrate] trunk_branch derive via gh repo view --json defaultBranchRef failed: gh: blocked by aloop PATH hardening
[orchestrate] Health check ✗ gh_auth: gh auth status failed: gh: blocked by aloop PATH hardening
[orchestrate] Health check ✗ gh_repo: gh repo view failed: gh: blocked by aloop PATH hardening
[orchestrate] Health check ✓ git_status: clean worktree
Error: Critical startup check failed: gh_auth
EXIT: 1
(Correctly forwards to orchestrateCommand — [orchestrate] prefix confirms this)
(gh blocked by PATH hardening is expected inside sandboxed environment)
```

```
$ cd /tmp/qa-test-1774183630 && aloop start --mode orchestrate --output json
[orchestrate] filter_repo derive via gh repo view --json nameWithOwner failed: gh: blocked by aloop PATH hardening
...
Error: Critical startup check failed: gh_auth
EXIT: 1
(BUG: --output json flag was specified but output is human-readable text, not JSON)
```

#### Feature 5: aloop start error handling

```
$ cd /tmp && aloop start
Error: Project prompts not found: /home/pj/.aloop/projects/e9671acd/prompts. Run `aloop setup` first.
EXIT: 1
```

```
$ aloop start --help
Usage: aloop start [options] [session-id]
Options: --project-root, --home-dir, --provider, --mode, --launch, --plan,
  --build, --review, --in-place, --max-iterations, --output
EXIT: 0
```
