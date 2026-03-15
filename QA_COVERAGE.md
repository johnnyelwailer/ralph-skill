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
