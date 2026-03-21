# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-21 | bfd8726 | PASS | Returns 1.0.0 |
| aloop --help | 2026-03-21 | bfd8726 | PASS | All documented commands present, unknown commands error properly |
| aloop status | 2026-03-21 | bfd8726 | PASS | Text and JSON output both work, shows sessions + provider health |
| aloop discover | 2026-03-21 | bfd8726 | PASS | Detects language, spec files, providers; text + JSON output |
| aloop start | 2026-03-21 | bfd8726 | PASS | Creates session, worktree, dashboard; JSON output correct |
| aloop stop | 2026-03-21 | bfd8726 | PASS | Stops session, removes from active list; errors on invalid ID |
| aloop start --launch resume | 2026-03-21 | bfd8726 | PASS | Resumes stopped session correctly |
| aloop steer (no session) | 2026-03-21 | bfd8726 | PASS | Errors with list of active sessions when ambiguous |
| README resume example | 2026-03-21 | bfd8726 | FAIL | README says `--launch-mode resume --session-dir` but actual CLI uses `--launch resume <session-id>` |
