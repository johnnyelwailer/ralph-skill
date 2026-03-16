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
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-16 | 3fff8a8 | FAIL | Still crashes with `Template not found: .../.aloop/templates/PROMPT_plan.md` and raw stack trace (exit 1). Retested iter 95. |
| `aloop orchestrate --spec NONEXISTENT.md` (packaged install) | 2026-03-16 | 3fff8a8 | PARTIAL | Exits 1 as expected, but still leaks raw stack frames instead of clean validation output. Retested iter 95. |
| `aloop gh watch --repo owner/repo` (packaged install) | 2026-03-16 | 3fff8a8 | FAIL | Still fails with `gh: blocked by aloop PATH hardening` for user-invoked GH flow. Retested iter 95. |
| `aloop devcontainer` (packaged install) | 2026-03-16 | 3fff8a8 | PASS | Successfully generated `.devcontainer/devcontainer.json` with expected mounts/env and postCreate command. |
| Dashboard layout @1920x1080 | 2026-03-16 | 3fff8a8 | PASS | Playwright screenshot + metrics in browser (`panelGuess=6`, sessions/docs/activity all visible). Evidence: `.../session-state/9598c68a-.../files/qa-iter84/dashboard-1920x1080-valid.png`. |
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-16 | 5d985d8 | FAIL | Still crashes with `Template not found: .../.aloop/templates/PROMPT_plan.md` + raw stack trace (exit 1). Retested iter 97. |
| `aloop scaffold` (fresh `HOME`, packaged install) | 2026-03-16 | 5d985d8 | FAIL | Still crashes with `Template not found: .../.aloop/templates/PROMPT_plan.md` + raw stack trace; prompt bootstrap never completes. Retested iter 97. |
| `aloop setup --non-interactive --mode orchestrate` (packaged install) | 2026-03-16 | 3eaba84 | FAIL | Still scaffolds loop prompts and writes `mode: plan-build-review` to config instead of orchestrator prompts. |
| `aloop orchestrate --spec NONEXISTENT.md` (packaged install) | 2026-03-16 | 3eaba84 | FAIL | Still leaks raw JS stack frames from `dist/index.js` instead of clean validation-only output. Retested iter 102. |
| `aloop start` (auto-monitoring) | 2026-03-16 | 761de21 | PASS | `aloop start --max-iterations 1` (after setup) prints session summary + dashboard URL; session visible in `aloop status`. |
| `aloop dashboard` (packaged-install assets) | 2026-03-16 | 761de21 | PASS | Fresh-project launch with packaged binary serves HTML from bundled `dist/dashboard`; screenshot captured at 1920x1080. |
| `aloop status --watch` | 2026-03-16 | 761de21 | PASS | Provides live terminal monitoring with repeated 2s refresh output. |
| `aloop gh watch` (error handling) | 2026-03-16 | 761de21 | PASS | Clean user-facing failure for invalid repo (`gh watch failed: gh issue list failed ...`), no stack trace. |
| `aloop devcontainer` (config generation) | 2026-03-16 | 761de21 | PASS | Correctly generates `.devcontainer/devcontainer.json` in fresh packaged-install test project. |
| `aloop setup --non-interactive --mode orchestrate` (packaged install) | 2026-03-16 | 761de21 | FAIL | Still writes `mode: 'plan-build-review'` in generated config; `--mode orchestrate` ignored. Retested. |
| `aloop start` (no config error UX, packaged install) | 2026-03-16 | 761de21 | FAIL | Fresh-project `aloop start --max-iterations 1` still leaks raw stack trace for missing config. Retested. |
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-16 | 835c6fa | PASS | Template bootstrap fixed, configs correctly written. |
| `aloop setup --non-interactive --mode orchestrate` (packaged install) | 2026-03-16 | 835c6fa | PASS | Correctly writes `mode: 'orchestrate'` in generated config. |
| `aloop gh watch` (error handling) | 2026-03-16 | 835c6fa | PASS | Clean error `gh watch failed: ...` returned instead of path block. |
| `aloop start` (no config error UX, packaged install) | 2026-03-16 | 835c6fa | FAIL | Still prints raw JS stack trace instead of clean error. Retested 835c6fa. |
| `aloop orchestrate --spec NONEXISTENT.md` (packaged install) | 2026-03-16 | 835c6fa | FAIL | Still leaks raw JS stack frames instead of clean error. Retested 835c6fa. |