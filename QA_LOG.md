# QA Log

## QA Session — 2026-03-22 (iteration 4)

### Test Environment
- Binary under test: /tmp/aloop-test-install-sp3iDl/bin/aloop
- Version: 1.0.0
- Commit: 76a2f100
- Temp dir: /tmp/qa-test-start-syZSOT (cleaned up)
- Features tested: 5

### Results
- PASS: aloop --version, aloop --help
- PASS: aloop orchestrate --help and error paths (nonexistent spec, invalid concurrency, negative budget, empty spec)
- PASS: aloop status (text and JSON output)
- PASS: aloop start (scaffold + launch + stop lifecycle)
- PASS: aloop dashboard --help, aloop gh --help, aloop steer --help, aloop steer error path

### Bugs Filed
- None

### Command Transcript

```
$ aloop --version
1.0.0
EXIT: 0

$ aloop --help
Usage: aloop [options] [command]
Aloop CLI for dashboard and project orchestration
Options:
  -V, --version                  output the version number
  -h, --help                     display help for command
Commands:
  resolve, discover, setup, scaffold, start, dashboard, status, active,
  stop, update, devcontainer, devcontainer-verify, orchestrate, steer,
  process-requests, gh, help
EXIT: 0

$ aloop orchestrate --help
Usage: aloop orchestrate [options]
Decompose spec into issues, dispatch child loops, and merge PRs
Options: --spec, --concurrency, --trunk, --issues, --label, --repo,
  --autonomy-level, --plan, --plan-only, --budget, --interval,
  --max-iterations, --auto-merge, --home-dir, --project-root, --output
EXIT: 0

$ aloop orchestrate --spec /nonexistent/SPEC.md --plan-only
Error: No spec files found matching: /nonexistent/SPEC.md
EXIT: 1

$ aloop orchestrate --concurrency notanumber
Error: Invalid concurrency value: notanumber (must be a positive integer)
EXIT: 1

$ aloop orchestrate --budget -5
Error: Invalid budget value: -5 (must be a positive number in USD)
EXIT: 1

$ aloop orchestrate --spec ""
Error: No spec files found matching:
EXIT: 1

$ aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=2754891  running  iter 372, orch_scan  (18h ago)
  ... (8 child sessions listed)
Provider Health:
  claude     healthy
  codex      healthy
  copilot    healthy
  gemini     cooldown (877 failures, resumes in 58m)
  opencode   healthy
EXIT: 0

$ aloop status --output json
{ "sessions": [...], "provider_health": [...] }
EXIT: 0

$ cd /tmp/qa-test-start-syZSOT && aloop scaffold
{ "config_path": "...", "prompts_dir": "...", "project_hash": "24efa751" }
EXIT: 0

$ aloop start --provider claude --max-iterations 1 --in-place
Session: qa-test-start-syzsot-20260322-115714
PID: 2333454
Dashboard: http://localhost:41245
EXIT: 0

$ aloop status | grep qa-test-start
  qa-test-start-syzsot-20260322-115714  pid=2333454  running  iter 1, plan  (4s ago)

$ aloop stop qa-test-start-syzsot-20260322-115714
Session qa-test-start-syzsot-20260322-115714 stopped.
EXIT: 0

$ aloop dashboard --help
Usage: aloop dashboard [options]
Options: --port, --session-dir, --workdir, --assets-dir
EXIT: 0

$ aloop gh --help
Subcommands: start, watch, status, stop, pr-create, pr-comment,
  issue-comment, issue-create, issue-close, issue-label, pr-merge,
  branch-delete, issue-comments, pr-comments
EXIT: 0

$ aloop steer --help
Options: --session, --affects-completed-work, --overwrite, --home-dir, --output
EXIT: 0

$ aloop steer "test instruction" --session nonexistent-session
Session not found: nonexistent-session
EXIT: 1
```

### Cleanup
- /tmp/qa-test-start-syZSOT removed
- /home/pj/.aloop/projects/24efa751 removed
- /home/pj/.aloop/sessions/qa-test-start-syzsot-20260322-115714 removed
- Test install prefix removed
