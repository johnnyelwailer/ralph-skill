# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop --help` shows 6 user-facing commands | 2026-03-24 | e468749 | PARTIAL | Shows 7 (includes `help` itself); spec says exactly 6 |
| `aloop help --all` shows all commands | 2026-03-24 | e468749 | PASS | All commands including hidden ones shown |
| Hidden commands still execute when invoked directly | 2026-03-24 | e468749 | PASS | resolve, scaffold tested; exit 0 with correct help |
| `aloop start --mode orchestrate` dispatches to orchestrate | 2026-03-24 | e468749 | PASS | Session ID starts with "orchestrator-", mode=orchestrate |
| `aloop start` with `mode: orchestrate` in config → orchestrator | 2026-03-24 | e468749 | PASS | Reads config and dispatches correctly |
| `aloop start --mode loop` overrides orchestrate config | 2026-03-24 | e468749 | PASS | Mode shows plan-build-review, session ID correct |
| `aloop orchestrate` direct invocation (backward compat) | 2026-03-24 | e468749 | PASS | Works, shows orchestrator-specific output |
| `aloop start <id> --launch resume` for orchestrator session | 2026-03-24 | e468749 | PASS | Resumes correctly via mode=orchestrate fallback |
| `aloop start <id> --launch resume` for loop session | 2026-03-24 | e468749 | PASS | Stays as plan-build-review mode |
| `engine` field written to meta.json via `aloop start` | 2026-03-24 | e468749 | FAIL | Field absent from meta.json; bug filed |
| `/aloop:start` skill docs `--mode` and `--max` flags | 2026-03-24 | e468749 | PASS | Skill documents both flags correctly |
