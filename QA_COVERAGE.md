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
| aloop start --mode orchestrate --output json | 2026-03-22 | 96944db3 | PASS | Fixed: final JSON error on stderr, exit 1. Note: orchestrate health-check lines still go to stdout in JSON mode (minor stream routing issue). |
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
| aloop discover (nonexistent path) | 2026-03-22 | c6a4a580 | PASS | Fixed: returns exit 1 with {"error":"Project root does not exist: /nonexistent"}. Re-tested iter 70. |
| aloop setup --help | 2026-03-22 | c6a4a580 | PASS | Shows --project-root, --spec, --providers, --mode, --autonomy-level, --non-interactive, --output options |
| provider health bash integration tests | 2026-03-22 | c6a4a580 | PASS | 8/8 tests pass: state transitions, backoff escalation, concurrent writes, lock failure, cross-session reset |
| provider health TS tests (session.test.ts) | 2026-03-22 | c6a4a580 | PASS | 29 tests pass (1 skipped: Windows-only). readProviderHealth, formatHealthLine, renderStatus, CLI integration |
| provider health unit tests (bash) | 2026-03-22 | c6a4a580 | PASS | 2/2 tests pass: degraded skip + all-degraded signal |
| aloop setup --non-interactive | 2026-03-22 | 96944db3 | PASS | Creates config.yml + prompts dir. Spec override, mode, providers, autonomy-level all work. Invalid values rejected. |
| aloop setup (interactive, no TTY) | 2026-03-22 | c6a4a580 | PASS | Fixed: "Error: Interactive setup requires a TTY. Re-run with --non-interactive to use defaults." exit 1. Re-tested iter 70. |
| aloop setup --output json | 2026-03-22 | c6a4a580 | PASS | Fixed: --output option added, error paths emit JSON. Success path still outputs text (minor inconsistency). Re-tested iter 70. |
| aloop resolve --help | 2026-03-22 | 96944db3 | PASS | Shows --project-root and --output options. Default output is JSON. |
| aloop resolve (basic) | 2026-03-22 | 96944db3 | PASS | Returns project + setup info as clean JSON. Text and JSON modes work. |
| aloop resolve (unconfigured project) | 2026-03-22 | 96944db3 | PASS | Returns JSON error "Run `aloop setup` first", exit 1. |
| aloop active --help | 2026-03-22 | 96944db3 | PASS | Shows --home-dir and --output options |
| aloop active (basic) | 2026-03-22 | 96944db3 | PASS | Lists active sessions with pid, state, work_dir. Text and JSON modes both work. JSON includes iteration, phase, stuck_count. |
| aloop active (empty, nonexistent home) | 2026-03-22 | 96944db3 | PASS | Returns "No active sessions" (text) or [] (JSON), exit 0. |
