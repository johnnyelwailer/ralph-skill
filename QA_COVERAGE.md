# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop start --provider opencode` | 2026-03-23 | 4a1f884 | PASS | P3 gap resolved; opencode accepted, invalid providers rejected |
| Provider validation (all 5 + round-robin) | 2026-03-23 | 4a1f884 | PASS | claude, codex, copilot, gemini, opencode, round-robin all accepted |
| `aloop status` | 2026-03-23 | 4a1f884 | PASS | Lists active sessions and provider health correctly |
| `aloop active` | 2026-03-23 | 4a1f884 | PASS | Lists running sessions with pid and workdir |
| `aloop scaffold` | 2026-03-23 | 4a1f884 | PASS | Creates project config and .opencode dir |
| `checkPrGates` unit tests (api_error classification) | 2026-03-23 | 4a1f884 | FAIL | 2 tests expect 'fail' but implementation returns 'api_error'; bug filed |
| `orchestrate --plan-only --output json` | 2026-03-23 | 4a1f884 | PASS | JSON output starts correctly |
