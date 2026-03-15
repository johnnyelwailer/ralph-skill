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
| Dashboard layout @1920x1080 | 2026-03-15 | 44dcff9 | FAIL | Playwright check: `asideVisible=false`, missing docs panel visibility at desktop breakpoint; screenshot: `/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png`. |
| Dashboard docs data (`/api/state`) | 2026-03-15 | 44dcff9 | FAIL | `workdir` points to `.../worktree/aloop/cli`; all docs (`TODO.md`,`SPEC.md`,`RESEARCH.md`,`REVIEW_LOG.md`,`STEERING.md`) length 0. |
| `aloop gh watch --max-concurrent 1` | 2026-03-15 | 44dcff9 | FAIL | Crashes with raw stack trace when `gh` command fails (`gh: blocked by aloop PATH hardening`). |
| `aloop gh status` | 2026-03-15 | 44dcff9 | PASS | Renders issue/branch/PR/status table output. |
| `aloop orchestrate --spec` (nonexistent, plan-only) | 2026-03-15 | 44dcff9 | FAIL | Still initializes orchestrator session and exits 0 for missing spec path. |
| `aloop steer` CLI | 2026-03-15 | 44dcff9 | FAIL | Subcommand absent from CLI registry (`aloop steer --help` shows top-level help only). |
| `aloop setup --non-interactive` (fresh HOME) | 2026-03-15 | 44dcff9 | FAIL | Throws `Template not found: ~/.aloop/templates/PROMPT_plan.md` with raw stack trace. |
| `aloop status --watch` | 2026-03-15 | 44dcff9 | PASS | Auto-refreshes every 2s and shows active session + provider health repeatedly. |
