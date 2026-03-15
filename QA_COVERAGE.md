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
| `aloop steer` CLI | 2026-03-15 | bdf3d32 | FAIL | Re-test (iter 48): still `error: unknown command 'steer'`. Dashboard API `/api/steer` works. |
| `aloop orchestrate --help` | 2026-03-15 | 1b998e4 | PASS | Shows all options (spec, concurrency, trunk, issues, plan-only, budget) |
| `aloop orchestrate --plan-only` | 2026-03-15 | 1b998e4 | PASS | Re-test (iter 47): happy path works in fresh temp git repo (`SPEC.md`), JSON session state returned. |
| `aloop orchestrate --spec` (nonexistent) | 2026-03-15 | bdf3d32 | FAIL | Re-test (iter 48): both relative and absolute nonexistent paths exit 0. |
| `aloop orchestrate --autonomy-level` | 2026-03-15 | 1b998e4 | FAIL | Invalid inputs leak Node.js stack trace. |
| `aloop discover` | 2026-03-15 | 1b998e4 | PASS | Re-test (iter 47): in fresh temp repo detects git + `SPEC.md` + `README.md` correctly. |
| `aloop update` | 2026-03-15 | 1b998e4 | PASS | Copies 46 files, reports version + timestamp |
| `aloop gh status` | 2026-03-15 | 1b998e4 | PASS | Outputs correct status table for GitHub integration |
| `aloop start` (no config) | 2026-03-15 | 1b998e4 | FAIL | Leaks raw Node.js stack trace instead of clean error. |
| Provider health backoff | 2026-03-15 | bdf3d32 | FAIL | Re-test (iter 48): codex still `consecutive_failures:1` with ~30h cooldown; 4th consecutive session finding this. |
| `aloop --help` (README usage sanity) | 2026-03-15 | 1b998e4 | PASS | Top-level command/help renders correctly with documented subcommands. |
| `aloop setup --help` | 2026-03-15 | bdf3d32 | PASS | Shows all options (project-root, spec, providers, autonomy-level, non-interactive). |
| `aloop setup --non-interactive` (happy path) | 2026-03-15 | bdf3d32 | PASS | Creates valid config.yml with correct project, provider, and spec settings. |
| `aloop setup --spec` (nonexistent) | 2026-03-15 | bdf3d32 | FAIL | Accepts nonexistent spec file without error or warning. |
| `aloop setup --providers` (invalid) | 2026-03-15 | bdf3d32 | FAIL | Accepts arbitrary provider name (e.g., `fakeprovider`) without validation. |
| `aloop setup --autonomy-level` (invalid) | 2026-03-15 | bdf3d32 | FAIL | Leaks raw Node.js stack trace for invalid autonomy level. |
| `aloop active` (text) | 2026-03-15 | bdf3d32 | PASS | Shows running sessions with pid, state, workdir, relative time. |
| `aloop active --output json` | 2026-03-15 | bdf3d32 | PASS | Valid JSON array with session details (iteration, phase, provider). |
| `aloop active` (no sessions) | 2026-03-15 | bdf3d32 | PASS | Clean "No active sessions" message; JSON returns `[]`. |
