# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-21 | 49c613b | PASS | Returns "1.0.0" |
| aloop --help | 2026-03-21 | 49c613b | PASS | Lists all commands |
| aloop status | 2026-03-21 | 49c613b | PASS | Shows active sessions and provider health |
| aloop start | 2026-03-21 | 49c613b | PASS | Starts session, creates worktree, shows session info |
| aloop stop | 2026-03-21 | 49c613b | PASS | Stops session, removes from active list; errors correctly on nonexistent session |
| aloop steer | 2026-03-21 | 49c613b | PASS | Correctly requires --session when multiple active sessions exist |
| aloop scaffold | 2026-03-21 | 49c613b | PASS | Creates config and prompts in project dir |
| aloop discover | 2026-03-21 | 49c613b | FAIL | Works on valid paths; exits 0 on non-existent path (bug filed) |
| aloop dashboard | 2026-03-21 | 49c613b | PASS | Serves HTML on /, SSE on /events, correct 404 on /api/* |
| aloop update | 2026-03-21 | 49c613b | PASS | Refreshes runtime, reports file count |
| aloop resolve | 2026-03-21 | 49c613b | PASS | Errors when no config exists |
| aloop gh --help | 2026-03-21 | 49c613b | PASS | Lists all gh subcommands |
| aloop orchestrate --help | 2026-03-21 | 49c613b | PASS | Lists all orchestrate options |
| test-install (npm pack + install) | 2026-03-21 | 49c613b | FAIL | Fails on fresh clone; requires manual npm install in dashboard/ first (bug filed) |
| npm run build | 2026-03-21 | 49c613b | FAIL | Fails with "vite: not found" when dashboard deps not installed (bug filed) |
