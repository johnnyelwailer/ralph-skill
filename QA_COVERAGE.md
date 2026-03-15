# QA Coverage Matrix

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop status` (text) | 2026-03-15 | b612aa4 | PASS | Shows sessions + provider health correctly |
| `aloop status --output json` | 2026-03-15 | b612aa4 | PASS | Structured JSON with sessions, health, orchestrator_trees |
| `aloop status --watch` | 2026-03-15 | b612aa4 | PASS | Auto-refreshes every 2s with ANSI clear |
| `aloop status --help` | 2026-03-15 | b612aa4 | PASS | Shows normal status output (no dedicated help, but acceptable) |
| Dashboard layout (desktop 1920x1080) | 2026-03-15 | b612aa4 | PASS | 3-panel layout: sidebar + documents + activity log + steer bar |
| Dashboard health tab | 2026-03-15 | b612aa4 | FAIL | Missing codex provider (only shows 4 of 5 providers) |
| Dashboard docs tabs | 2026-03-15 | b612aa4 | FAIL | All doc content empty (API workdir points to aloop/cli/ not worktree root) |
| Dashboard activity log | 2026-03-15 | b612aa4 | PASS | 151 events with timestamps, phases, providers, durations, commit hashes |
| Dashboard steer input | 2026-03-15 | b612aa4 | PASS | Input + Send button visible, API validates at /api/steer |
| Dashboard stop controls | 2026-03-15 | b612aa4 | PASS | Stop dropdown button visible in bottom bar |
| Dashboard artifact serving | 2026-03-15 | b612aa4 | PASS | `/api/artifacts/25/proof-manifest.json` returns 200 |
| `aloop steer` CLI | 2026-03-15 | b612aa4 | FAIL | "unknown command" — not registered as CLI subcommand |
| `aloop orchestrate --help` | 2026-03-15 | b612aa4 | PASS | Shows all options (spec, concurrency, trunk, issues, plan-only, budget) |
| `aloop orchestrate --plan-only` | 2026-03-15 | b612aa4 | PASS | Creates orchestrator session with correct state |
| `aloop orchestrate` (missing spec) | 2026-03-15 | b612aa4 | FAIL | Raw stack trace leaked instead of user-friendly error |
| `aloop discover` | 2026-03-15 | b612aa4 | PASS | Detects project, specs, providers, context files correctly |
| `aloop discover` (empty repo) | 2026-03-15 | b612aa4 | PASS | Gracefully handles empty repo with no specs |
| Provider health backoff | 2026-03-15 | b612aa4 | FAIL | codex: 1 failure → 30h cooldown (spec says no cooldown for 1 failure) |
| `aloop stop` (invalid session) | 2026-03-15 | b612aa4 | PASS | Clean error message: "Session not found" |
| `aloop stop` (no argument) | 2026-03-15 | bfecfb5 | PASS | Clear error: "session-id required for stop command." |
| Provider health backoff (re-test) | 2026-03-15 | bfecfb5 | FAIL | Still broken: codex consecutive_failures=1 with 30h cooldown |
| Dashboard docs tabs (re-test) | 2026-03-15 | bfecfb5 | FAIL | Still broken: all docs 0 chars, workdir=aloop/cli/ |
| Dashboard health API (re-test) | 2026-03-15 | bfecfb5 | FAIL | Still broken: health API returns empty object |
| `aloop steer` CLI (re-test) | 2026-03-15 | bfecfb5 | FAIL | Still broken: "unknown command 'steer'" |
| VERSIONS.md (Gate 8) | 2026-03-15 | bfecfb5 | PASS | Git 2.x present in Runtime section |
| `aloop update` | 2026-03-15 | bfecfb5 | PASS | Copies 46 files, reports version + timestamp |
| `aloop stop` --help | 2026-03-15 | bfecfb5 | PASS | Shows main help (no dedicated stop help, acceptable) |
| `aloop orchestrate --autonomy-level` | 2026-03-15 | b7af2ec4 | FAIL | Works for valid inputs, but invalid inputs leak stack trace |
| `aloop orchestrate` (DI fix) | 2026-03-15 | b7af2ec4 | PASS | Runs successfully without Commander Command object DI error |
| `aloop gh status` | 2026-03-15 | b7af2ec4 | PASS | Outputs correct status table for GitHub integration |
| `aloop gh watch` | 2026-03-15 | b7af2ec4 | FAIL | Fails due to mocked gh and leaks raw Node.js stack trace |
