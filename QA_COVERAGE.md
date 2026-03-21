# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-21 | fbe350e | PASS | Returns 1.0.0 |
| aloop --help | 2026-03-21 | fbe350e | PASS | Lists all 16 commands |
| aloop (no args) | 2026-03-21 | fbe350e | PASS | Shows help, exits 1 |
| aloop gh --help | 2026-03-21 | fbe350e | PASS | Lists 13 GH subcommands |
| aloop start --help | 2026-03-21 | fbe350e | PASS | All flags documented |
| aloop status | 2026-03-21 | fbe350e | PASS | Shows active sessions + provider health table |
| aloop discover | 2026-03-21 | fbe350e | PASS | Detects spec, providers, language, recommends mode |
| aloop setup --non-interactive | 2026-03-21 | fbe350e | PASS | Creates config and prompts |
| aloop start (full lifecycle) | 2026-03-21 | fbe350e | PASS | Creates session, worktree, launches loop, shows in status |
| aloop stop | 2026-03-21 | fbe350e | PASS | Stops session cleanly, removed from status |
| aloop steer (error paths) | 2026-03-21 | fbe350e | PASS | Good error messages for missing/nonexistent sessions |
| aloop dashboard (HTTP) | 2026-03-21 | fbe350e | PASS | Serves HTML on root, SSE /events works |
| aloop dashboard (REST API) | 2026-03-21 | fbe350e | FAIL | All /api/* endpoints return 404, bug filed |
| README resume syntax | 2026-03-21 | fbe350e | FAIL | --launch-mode and --session-dir don't exist, bug filed |
| aloop orchestrate --help | 2026-03-21 | fbe350e | PASS | All flags documented |
| aloop devcontainer --help | 2026-03-21 | fbe350e | PASS | Shows options |
| aloop update --help | 2026-03-21 | fbe350e | PASS | Shows options |
| process-requests: agent request validation | 2026-03-21 | 4aa9423 | FAIL | processAgentRequests never called — request files ignored, no failed/ dir, no processed-ids.json |
| process-requests: request ID idempotency | 2026-03-21 | 4aa9423 | FAIL | processed-ids.json never created — idempotency tracking unreachable |
| process-requests: post_comment dedup marker | 2026-03-21 | 4aa9423 | FAIL | Cannot test — processAgentRequests not called by process-requests |
| process-requests: error path (nonexistent session) | 2026-03-21 | 4aa9423 | FAIL | Silently exits 0 for nonexistent --session-dir |
| process-requests: error path (missing --session-dir) | 2026-03-21 | 4aa9423 | PASS | Correctly errors with "required option" message |
| process-requests: empty requests dir | 2026-03-21 | 4aa9423 | PASS | Returns valid JSON output with zero counts |
| aloop gh issue-comment (error paths) | 2026-03-21 | 4aa9423 | PASS | Missing --session, --request, nonexistent session all error correctly |
