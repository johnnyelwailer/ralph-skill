# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-22 | 5daa89ec | PASS | Outputs "1.0.0", exit 0 |
| aloop --help | 2026-03-22 | 5daa89ec | PASS | Shows all commands, exits 0. CLI simplification (6-command default) is known TODO, not tested as pass/fail for that. |
| aloop status | 2026-03-22 | 5daa89ec | PASS | Lists active sessions + provider health. Readable output. |
| aloop status --watch | 2026-03-22 | 5daa89ec | PASS | Auto-refreshes every 2s with ANSI clear. Works correctly. TODO.md marks this as unimplemented but it works. |
| aloop start --help | 2026-03-22 | 5daa89ec | PASS | Shows all options including --mode, --output, --launch, etc. |
| aloop start --mode orchestrate | 2026-03-22 | 5daa89ec | PASS | Correctly forwards to orchestrateCommand. Health checks run, fails gracefully when gh unavailable. Exit code 1 on failure. |
| aloop start (error: no setup) | 2026-03-22 | 5daa89ec | PASS | Helpful error "Run `aloop setup` first" in non-setup dir, exit 1 |
| aloop start --mode orchestrate --output json | 2026-03-22 | 5daa89ec | FAIL | --output json flag ignored when forwarding to orchestrate; outputs human-readable text, not JSON. Bug filed. |
| aloop gh (subcommand listing) | 2026-03-22 | 5daa89ec | PASS | Shows all 14 subcommands with descriptions |
| aloop gh start --help | 2026-03-22 | 5daa89ec | PASS | Shows --issue, --spec, --provider, --max, --repo, --project-root, --output options |
| aloop gh start (missing --issue) | 2026-03-22 | 5daa89ec | PASS | Clean error "required option '--issue <number>' not specified", exit 1 |
| aloop gh pr-create (missing --session) | 2026-03-22 | 5daa89ec | PASS | Clean error "required option '--session <id>' not specified", exit 1 |
| aloop gh branch-delete | 2026-03-22 | 5daa89ec | PASS | Requires --request file (policy enforcement via request pipeline) |
| aloop nonexistent-command | 2026-03-22 | 5daa89ec | PASS | "error: unknown command", exit 1 |
| aloop steer --help | 2026-03-22 | e5ef630c | PASS | Shows all options: --session, --affects-completed-work, --overwrite, --output |
| aloop steer (no args) | 2026-03-22 | e5ef630c | PASS | "missing required argument 'instruction'", exit 1 |
| aloop steer (nonexistent session) | 2026-03-22 | e5ef630c | PASS | "Session not found", exit 1. JSON mode works correctly. |
| aloop steer (multi-session auto-detect) | 2026-03-22 | e5ef630c | PASS | Lists active sessions and asks user to specify with --session |
| aloop stop --help | 2026-03-22 | e5ef630c | PASS | Shows session-id arg and --home-dir, --output options |
| aloop stop (no args) | 2026-03-22 | e5ef630c | PASS | "missing required argument 'session-id'", exit 1 |
| aloop stop (nonexistent session) | 2026-03-22 | e5ef630c | PASS | "Session not found", exit 1. JSON mode returns {"success":false,"reason":"..."} |
| aloop dashboard --help | 2026-03-22 | e5ef630c | PASS | Shows --port, --session-dir, --workdir, --assets-dir options |
| aloop dashboard (launch) | 2026-03-22 | e5ef630c | PASS | Starts HTTP server, serves HTML frontend, SSE /events endpoint streams state. Slow startup (~5s). |
| aloop scaffold --help | 2026-03-22 | e5ef630c | PASS | Shows all options: --provider, --language, --spec-files, --output, etc. |
| aloop scaffold (basic) | 2026-03-22 | e5ef630c | PASS | Creates config.yml + prompts dir. JSON and text output both work. Overrides (--language, --provider) applied. |
| aloop discover --help | 2026-03-22 | e5ef630c | PASS | Shows --project-root and --output options |
| aloop discover (basic) | 2026-03-22 | e5ef630c | PASS | Rich JSON output with project info, providers, spec candidates, mode recommendation. Text output clean. |
| aloop discover (nonexistent path) | 2026-03-22 | e5ef630c | FAIL | Returns exit 0 with empty results for nonexistent path instead of error. Bug filed. |
