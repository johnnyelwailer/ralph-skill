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
| `aloop --help` extended commands (`steer`, `orchestrate`, `devcontainer`) | 2026-03-16 | ecb1279 | PASS | Commands visible in help output. |
| `aloop update` (permissions) | 2026-03-16 | ecb1279 | PASS | `loop.sh` and `aloop` are executable after update (`-rwxr-xr-x`). |
| `aloop setup --non-interactive` (fresh `HOME`) | 2026-03-16 | ecb1279 | FAIL | Crashes: `Template not found: .../.aloop/templates/PROMPT_plan.md` (exit 1). |
| `aloop start` with `aloop` absent from `PATH` | 2026-03-16 | ecb1279 | PASS | `PATH=/usr/bin:/bin` still starts session and prints dashboard URL. |
| Dashboard layout @1920x1080 | 2026-03-16 | ecb1279 | PASS | Playwright metrics: sidebar/docs/activity visible; screenshot captured. |
| Dashboard docs data (`/api/state`) | 2026-03-16 | ecb1279 | PASS | `workdir` points to worktree root; docs fields non-empty (except empty STEERING.md). |
| `aloop setup --non-interactive` (fresh `HOME`) | 2026-03-16 | 3fdc5e9 | FAIL | Still crashes: `Template not found: .../.aloop/templates/PROMPT_plan.md` (exit 1). Retested iter 58. |
| `aloop orchestrate --spec` (nonexistent) | 2026-03-16 | 3fdc5e9 | PARTIAL | Now exits 1 (was 0). But leaks raw stack trace instead of clean error message. |
| `aloop gh watch` (error handling) | 2026-03-16 | 3fdc5e9 | FAIL | Crashes with raw stack trace. Also: `gh` blocked by PATH hardening even for user-invoked `aloop gh` commands. |
| `aloop devcontainer` | 2026-03-16 | 3fdc5e9 | FAIL | Crashes: `TypeError: deps.discover is not a function`. `--help` works. |
| `aloop orchestrate --plan-only` (happy path) | 2026-03-16 | 3fdc5e9 | PASS | Session initialized, state file created, directories set up, plan-only respected. |
| Gate 3 touched-file branch coverage (`gh.ts`, `devcontainer.ts`, `project.mjs`) | 2026-03-16 | current | PASS | `npx --yes tsx --test --experimental-test-coverage src/commands/gh.test.ts src/commands/devcontainer.test.ts src/commands/project.test.ts` => `gh.ts` 82.03%, `devcontainer.ts` 91.20%, `project.mjs` 89.26%; added targeted tests for `failGhWatch` JSON error path, `resolveDevcontainerDeps` fallback paths, and default-template bootstrap guard behavior. |
| Dashboard layout @1920x1080 | 2026-03-16 | 3eaba84 | FAIL | Screenshot captured (`/home/pj/.copilot/session-state/57ce3bec-26c8-4a6c-89a4-dde71f3bfc87/files/qa-iter83/dashboard-1920x1080.png`); browser text check shows only sessions panel visibly active (`panel_guess=1`), docs/activity not visible. |
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-16 | 3eaba84 | FAIL | Still crashes: `Template not found: .../.aloop/templates/PROMPT_plan.md` with raw stack trace (exit 1). Retested iter 83. |
| `aloop orchestrate --spec NONEXISTENT.md` | 2026-03-16 | 3eaba84 | PARTIAL | Correctly exits 1 now, but still leaks raw stack trace instead of clean user-facing error. |
| `aloop gh watch` (error handling) | 2026-03-16 | 3eaba84 | PARTIAL | Raw stack trace no longer reproduced, but command still fails due `gh: blocked by aloop PATH hardening` for user-invoked GH command. |
| `aloop devcontainer` | 2026-03-16 | 3eaba84 | PASS | No `deps.discover` crash; command generated `.devcontainer/devcontainer.json` successfully. |
| `aloop scaffold` (packaged install, fresh `HOME`) | 2026-03-16 | 3eaba84 | FAIL | Fails on template bootstrap (`PROMPT_plan.md` missing), preventing verification of prompt set contents including `PROMPT_qa.md`. |
