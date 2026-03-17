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
| `aloop start` (no config error UX, packaged install) | 2026-03-17 | current | PASS | Clean error returned, no stack trace leaked. |
| `aloop orchestrate --spec NONEXISTENT.md` (packaged install) | 2026-03-17 | current | PASS | Clean error returned, no stack trace leaked. |
| `aloop dashboard` layout @1920x1080 (fresh project) | 2026-03-17 | current | PASS | Playwright test passed, UI elements found. No fallback HTML. |
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-17 | current | PASS | Successfully completes without template error. |
| `aloop scaffold` (fresh `HOME`, packaged install) | 2026-03-17 | current | PASS | Successfully returns JSON response without template error. |
| `aloop setup --non-interactive` (fresh `HOME`, packaged install) | 2026-03-17 | 89a008b | PASS | Setup succeeds and writes project config under `~/.aloop/projects/<hash>/config.yml` (isolated HOME). Invalid provider path returns clean validation error (exit 1). |
| `aloop setup --non-interactive --mode orchestrate` (packaged install) | 2026-03-17 | 89a008b | PASS | Generated config contains `mode: 'orchestrate'`; invalid mode (`banana`) returns clean validation error. |
| `aloop start` (packaged install) | 2026-03-17 | 89a008b | FAIL | New regression: exits immediately with `Error: deps.discoverWorkspace is not a function` in both configured and fresh repos. |
| `aloop status --watch` | 2026-03-17 | 89a008b | PASS | Live refresh loop prints status every 2s (`timeout 6` captured three refreshes). |
| Dashboard layout @1920x1080 (host dashboard URL from meta.json) | 2026-03-17 | 89a008b | FAIL | Playwright metric check at `http://localhost:4040` shows `visibleAside=false`, no visible sessions/docs/activity tokens. Screenshot: `/tmp/qa-dashboard-host-1920x1080.png`. |
| `aloop start` (packaged install, fresh project) | 2026-03-17 | f4707ed | PASS | Setup + start works: session created, plan iteration started, stop works. `deps.discoverWorkspace` regression fixed. No-config error returns clean message (no stack trace). |
| `aloop setup` input validation (packaged install) | 2026-03-17 | f4707ed | PASS | Invalid provider, nonexistent spec file, invalid mode all return clean errors with exit 1. Multiple invalid providers listed correctly. |
| `aloop steer` (packaged install, isolated session) | 2026-03-17 | f4707ed | PASS | Steering instruction queued correctly (frontmatter + template + instruction in queue file). Missing instruction returns clean error. Multi-session disambiguation works. |
| `aloop orchestrate --spec` multi-file glob (packaged install) | 2026-03-17 | f4707ed | PASS | `--spec "SPEC.md specs/*.md"` correctly resolves all 3 files. Single spec works. Nonexistent spec returns clean error. Plan-only mode works. |
| `aloop devcontainer` (packaged install, fresh project) | 2026-03-17 | f4707ed | PARTIAL | Config generation works (mounts, env vars, VS Code extensions, postCreateCommand). Re-run augments. JSON output works. BUT: `OPENCODE_API_KEY` missing from remoteEnv and opencode install missing from postCreateCommand even when opencode is explicitly configured as a provider. |
| `aloop setup --non-interactive --mode orchestrate` (packaged install) | 2026-03-17 | 9ec9cb8 | PASS | Setup succeeds in isolated `HOME`; invalid mode (`banana`) returns clean validation error (exit 1). |
| `aloop start` (packaged install, loop mode, fresh `HOME`) | 2026-03-17 | current | FAIL | Regression: still fails with `Loop script not found` despite recent scaffold fixes. |
| `aloop start` (no-config error UX, packaged install) | 2026-03-17 | 9ec9cb8 | PASS | Fresh repo without setup returns clean error (`Run aloop setup first`), no stack trace. |
| `aloop orchestrate --spec` multi-file glob (packaged install) | 2026-03-17 | 9ec9cb8 | PASS | Plan-only run resolves `SPEC.md specs/*.md` to three files; nonexistent spec returns clean error and exit 1. |
| `aloop devcontainer` (packaged install, configured providers) | 2026-03-17 | 9ec9cb8 | PASS | Generated config now includes `OPENCODE_API_KEY` in `remoteEnv` and opencode install in `postCreateCommand`; auth preflight warns clearly. |
| `aloop gh watch --repo` (packaged install, unauthenticated gh) | 2026-03-17 | 9ec9cb8 | PASS | Fails cleanly with user-facing auth guidance (`gh auth login`), no stack trace. |
| Dashboard layout @1920x1080 (host dashboard URL from `meta.json`) | 2026-03-17 | current | FAIL | Playwright check still shows layout mismatch (`visibleAside=false`, `panelGuess=2`). Screenshot: `/tmp/qa-dashboard-host-1920x1080.png`. |
| Dashboard Health tab provider visibility (host dashboard) | 2026-03-17 | 9ec9cb8 | PASS | Health tab found and includes `codex`, `claude`, `gemini`, `copilot`, `opencode` (`/home/pj/.copilot/session-state/aa6c290a-09a3-45eb-9eed-fc4a07df59a7/files/qa-iter174/dashboard-health-host.json`). |
| Orchestrator trunk auto-merge (`--auto-merge`) | 2026-03-17 | current | PASS | Flag parsed correctly and written to `auto_merge_to_main` in state file. |
| Dual-mode setup recommendation | 2026-03-17 | current | PASS | Setup interactive prompt recommends orchestrator mode for complex specs and defaults to it correctly. |
