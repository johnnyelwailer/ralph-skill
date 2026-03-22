# QA Log

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
