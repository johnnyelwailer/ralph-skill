# QA Coverage Matrix

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop status` (text) | 2026-03-15 | 5d1a64c | PASS | Shows sessions + provider health correctly |
| `aloop status --output json` | 2026-03-15 | 5d1a64c | PASS | Structured JSON with sessions, health |
| `aloop status --watch` | 2026-03-15 | 5d1a64c | PASS | Auto-refreshes correctly |
| `aloop steer` CLI | 2026-03-15 | 5d1a64c | FAIL | Still `error: unknown command 'steer'`. |
| `aloop discover` | 2026-03-15 | 5d1a64c | PASS | Detects git repo and SPEC.md correctly |
| `aloop setup --spec` (nonexistent) | 2026-03-15 | 5d1a64c | FAIL | Accepts nonexistent spec file without error or warning. |
| `aloop setup --providers` (invalid) | 2026-03-15 | 5d1a64c | FAIL | Accepts arbitrary provider name (e.g., `fakeprovider`) without validation. |
| `aloop setup --autonomy-level` (invalid) | 2026-03-15 | 5d1a64c | FAIL | Leaks Node.js stack trace instead of clean error. |
| `aloop orchestrate --spec` (nonexistent) | 2026-03-15 | 5d1a64c | FAIL | Accepts nonexistent spec file and initializes session. |
| `aloop devcontainer` | 2026-03-15 | 5d1a64c | FAIL | Crashes with `TypeError: deps.discover is not a function`. |
| `aloop update` | 2026-03-15 | 5d1a64c | PASS | Copies files and reports version |
| `aloop active` | 2026-03-15 | 5d1a64c | PASS | Lists active sessions correctly |
