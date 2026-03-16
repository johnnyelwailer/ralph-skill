# QA Coverage Matrix

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop scaffold` (all prompts) | 2026-03-16 | bf68a48 | PASS | Now correctly includes all 6 prompts including `PROMPT_qa.md`. |
| `aloop steer` CLI (functionality) | 2026-03-16 | bf68a48 | PASS | Works correctly; prepends template to instruction and queues override. |
| `aloop steer` CLI (visibility) | 2026-03-16 | current | PASS | Fixed help interception in `aloop.mjs` and added to help text. |
| `aloop status` | 2026-03-16 | bf68a48 | PASS | Lists sessions and health; text and JSON output work. |
| `aloop resolve` | 2026-03-16 | bf68a48 | PASS | Correctly identifies project root, config, and spec. |
| `aloop discover` | 2026-03-16 | bf68a48 | PASS | Detects specs, validation commands, and providers correctly. |
| `aloop update` (copying) | 2026-03-16 | bf68a48 | PASS | Refreshes runtime assets from source and updates version stamp. |
| `aloop update` (permissions) | 2026-03-16 | current | PASS | Now correctly sets 0o755 bit on `bin/` scripts and shims. |
| `aloop start` (initialization) | 2026-03-16 | bf68a48 | PASS | Correctly initializes session, worktree (if git), and launches loop harness. |
| `aloop start` (PATH issues) | 2026-03-16 | bf68a48 | FAIL | Dashboard spawn fails if `aloop` not in `PATH`. Bug filed. |
| `aloop dashboard` (launch) | 2026-03-16 | bf68a48 | PASS | Serves dashboard frontend and responds to API requests. |
| `aloop setup --non-interactive` | 2026-03-16 | bf68a48 | PASS | Configures project and scaffolds without user input. |
| `aloop stop` | 2026-03-16 | bf68a48 | PASS | Terminates loop process and updates status. |
| Provider health backoff | 2026-03-15 | 1b998e4 | PASS | Correctly transitions to cooldown after 2 failures. |
| `aloop orchestrate --spec` (nonexistent) | 2026-03-15 | 85719f5 | FAIL | Still initializes session and exits 0 instead of failing with clean error. |
| Dashboard layout @1920x1080 | 2026-03-15 | 85719f5 | FAIL | Playwright check: `asideVisible=false`, sidebar missing at desktop breakpoint. |
| Dashboard docs data (`/api/state`) | 2026-03-15 | 44dcff9 | FAIL | `workdir` points to `.../worktree/aloop/cli`; all docs length 0. |
