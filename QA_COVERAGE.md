# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-22 | 13b6c82 | PASS | Returns "1.0.0" correctly |
| aloop --help | 2026-03-22 | 13b6c82 | PASS | All documented commands present in help output |
| aloop status | 2026-03-22 | 13b6c82 | PASS | Shows active sessions with pid, state, iteration, phase; shows provider health with cooldown info |
| aloop scaffold | 2026-03-22 | 13b6c82 | PASS | Creates project config and prompts directory |
| aloop start | 2026-03-22 | 13b6c82 | PASS | Launches session with worktree, JSON output correct, --max-iterations respected |
| aloop active | 2026-03-22 | 13b6c82 | PASS | Lists running sessions with pid, state, workdir |
| aloop stop (already stopped) | 2026-03-22 | 13b6c82 | FAIL | Says "Session not found" for stopped sessions — should say "Session already stopped" |
| aloop discover | 2026-03-22 | 13b6c82 | PASS | Detects providers, specs, language, recommends loop/orchestrate mode |
| aloop steer (multi-session) | 2026-03-22 | 13b6c82 | PASS | Clear error listing active sessions when no --session specified |
| aloop dashboard | 2026-03-22 | 13b6c82 | PASS | Serves HTML, SSE endpoint returns full state with heartbeats |
| aloop orchestrate --help | 2026-03-22 | 13b6c82 | PASS | All documented flags present |
| aloop gh --help | 2026-03-22 | 13b6c82 | PASS | All GH subcommands present |

## Coverage: 92% (11/12 PASS, 1 FAIL)
