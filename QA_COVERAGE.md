# QA Coverage Matrix

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop status` (text) | 2026-03-15 | 1b998e4 | PASS | Shows sessions + provider health correctly |
| `aloop status --output json` | 2026-03-15 | 1b998e4 | PASS | Structured JSON with sessions, health, orchestrator_trees |
| `aloop status --watch` | 2026-03-15 | 1b998e4 | PASS | Auto-refreshes every 2s with ANSI clear |
| `aloop status --help` | 2026-03-15 | 1b998e4 | PASS | Shows normal status output (no dedicated help, but acceptable) |
| Dashboard layout (desktop 1920x1080) | 2026-03-15 | 1b998e4 | FAIL | Re-test (iter 47): 1920x1080 screenshot still lacks expected shell labels (`SESSIONS`/`DOCUMENTS`/`ACTIVITY`), `aside: 0`, stop button still visible. |
| Dashboard health tab | 2026-03-15 | 1b998e4 | FAIL | Missing codex provider (only shows 4 of 5 providers) |
| Dashboard docs tabs | 2026-03-15 | 1b998e4 | FAIL | Re-test (iter 47): still all docs 0 chars; `/api/state.workdir` remains `.../worktree/aloop/cli`. |
| Dashboard activity log | 2026-03-15 | 1b998e4 | PASS | 151 events with timestamps, phases, providers, durations, commit hashes |
| Dashboard steer input | 2026-03-15 | 1b998e4 | PASS | Input + Send button visible, API validates at /api/steer |
| Dashboard stop controls | 2026-03-15 | 1b998e4 | PASS | Stop dropdown button visible in bottom bar |
| Dashboard artifact serving | 2026-03-15 | 1b998e4 | PASS | `/api/artifacts/25/proof-manifest.json` returns 200 |
| `aloop steer` CLI | 2026-03-15 | 1b998e4 | FAIL | Re-test (iter 47): still broken with `error: unknown command 'steer'` (exit 1). |
| `aloop orchestrate --help` | 2026-03-15 | 1b998e4 | PASS | Shows all options (spec, concurrency, trunk, issues, plan-only, budget) |
| `aloop orchestrate --plan-only` | 2026-03-15 | 1b998e4 | PASS | Re-test (iter 47): happy path works in fresh temp git repo (`SPEC.md`), JSON session state returned. |
| `aloop orchestrate --spec` (nonexistent) | 2026-03-15 | 1b998e4 | FAIL | Re-test (iter 47): still exits 0 and initializes session with `Spec: NONEXISTENT.md`. |
| `aloop orchestrate --autonomy-level` | 2026-03-15 | 1b998e4 | FAIL | Invalid inputs leak Node.js stack trace. |
| `aloop discover` | 2026-03-15 | 1b998e4 | PASS | Re-test (iter 47): in fresh temp repo detects git + `SPEC.md` + `README.md` correctly. |
| `aloop update` | 2026-03-15 | 1b998e4 | PASS | Copies 46 files, reports version + timestamp |
| `aloop gh status` | 2026-03-15 | 1b998e4 | PASS | Outputs correct status table for GitHub integration |
| `aloop start` (no config) | 2026-03-15 | 1b998e4 | FAIL | Leaks raw Node.js stack trace instead of clean error. |
| Provider health backoff | 2026-03-15 | 1b998e4 | FAIL | Re-test (iter 47): `codex.json` still `consecutive_failures:1` with ~30h cooldown; violates 1st-failure/no-cooldown and 60m cap. |
| `aloop --help` (README usage sanity) | 2026-03-15 | 1b998e4 | PASS | Top-level command/help renders correctly with documented subcommands. |
