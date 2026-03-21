# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --help / CLI structure | 2026-03-21 | 873e94b | PASS | All README-listed commands present |
| aloop status | 2026-03-21 | 873e94b | PASS | Text + JSON output, shows sessions and provider health |
| aloop discover | 2026-03-21 | 873e94b | PASS | Detects spec, git, providers, recommends mode |
| aloop start / stop lifecycle | 2026-03-21 | 873e94b | PASS | Start with --max-iterations 1, stop by session-id, session removed from active list |
| aloop scaffold | 2026-03-21 | 873e94b | PASS | Creates project config and prompts dir |
| aloop dashboard | 2026-03-21 | 873e94b | PASS | Starts on custom port, serves session data |
| aloop steer (error path) | 2026-03-21 | 873e94b | PASS | Missing arg correctly errors |
| aloop stop (error path) | 2026-03-21 | 873e94b | PASS | Missing arg and nonexistent session correctly error |
| aloop orchestrate --help | 2026-03-21 | 873e94b | PASS | All README-listed flags present |
| aloop gh --help | 2026-03-21 | 873e94b | PASS | Shows subcommands including pr-create, pr-comment, pr-merge |
| Inline review comments (posting) | 2026-03-21 | 873e94b | NOT IMPL | Spec requires inline comments on PRs — TODO item not yet complete |
| Builder resolves review threads | 2026-03-21 | 873e94b | NOT IMPL | Spec requires builder to resolve threads — TODO item not yet complete |
