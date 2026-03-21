# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CLI basics (--version, --help, no args, unknown cmd) | 2026-03-21 | b6d8eb8 | PASS | All exit codes correct, help matches README command table |
| aloop status | 2026-03-21 | b6d8eb8 | PASS | Text and JSON output work, provider health displayed correctly |
| aloop start (fresh + resume) | 2026-03-21 | b6d8eb8 | PASS | Session created, JSON output, resume by session-id works |
| aloop scaffold | 2026-03-21 | b6d8eb8 | PASS | Creates config.yml, prompts dir with all expected templates |
| aloop dashboard | 2026-03-21 | b6d8eb8 | PASS | Launches HTTP server, serves HTML and /api/state endpoint |
| aloop discover | 2026-03-21 | b6d8eb8 | PASS | Detects specs, providers, git state, recommends loop/orchestrate mode |
| aloop stop (error paths) | 2026-03-21 | b6d8eb8 | PASS | Missing args and nonexistent session handled correctly |
| aloop steer (error paths) | 2026-03-21 | b6d8eb8 | PASS | Missing args and nonexistent session handled correctly |
| README accuracy (resume flags) | 2026-03-21 | b6d8eb8 | FAIL | README documents --launch-mode and --session-dir which don't exist; bug filed |
