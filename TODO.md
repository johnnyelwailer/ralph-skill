# Project TODO

## Current Phase: Installer + dashboard spec parity

### In Progress
- [x] Fix runtime install path mismatch: ensure installer output contains `~/.aloop/cli/dist/index.js` so loop launchers (`loop.ps1` / `loop.sh`) can reliably start the dashboard CLI. (P0)
- [ ] [review] Gate 3: branch coverage evidence is missing for changed files (`install.ps1`, `ralph/cli/dashboard/e2e/smoke.spec.ts`, `ralph/cli/dashboard/playwright.config.ts`), and existing `coverage/coverage-summary.json` reports only `ralph/cli/src/commands/project.ts` at 63.73% branches; add coverage reporting for touched files and raise each touched file to >=80% branch coverage (new modules >=90%), including installer branches for stale-dir cleanup, CLI auto-install selection/missing-npm paths, VS Code-not-installed prompt path, and Unix chmod path. (priority: high)
- [ ] [review] Gate 4: `ralph/cli/dashboard/package.json` still carries unused dependency `"aloop-cli": "file:.."`; remove it (or add concrete runtime/build usage with tests) to eliminate dead configuration. (priority: high)

### Up Next
- [x] Add Playwright E2E foundation in `<skill>/cli/dashboard/` (`@playwright/test`, config, and `test:e2e` script using the real dashboard server via `webServer`). (P1)
- [x] Add first fixture-backed Playwright specs for the required flows: initial render, session list/status, progress view, docs markdown render, log view, steer write side effect, stop flow, nav switching, and SSE reconnect behavior. (P1)
- [ ] Refresh Node prerequisite docs to latest LTS (22.x / latest LTS wording), replacing outdated Node 18 references in README and related docs. (P0)
- [ ] Update prerequisite install guidance to recommend version managers (`nvm-windows`/`fnm` on Windows, `nvm`/`fnm` on macOS/Linux) and include `nvm install --lts && nvm use --lts` example flow. (P0)
- [ ] Audit `package.json` files and set/add `engines.node` to Node.js 22 LTS (or latest LTS equivalent) where applicable. (P0)
- [ ] Deliver dashboard frontend as a self-contained HTML response (inline JS/CSS) and update `dashboard.ts` asset serving to match spec. (P1)
- [ ] Remove unused `"aloop-cli": "file:.."` from dashboard dependencies unless a concrete runtime/build use is added. (P1)
- [ ] Add focused tests for docs markdown safety (unsafe HTML handling) and setup-discovery `{{REFERENCE_FILES}}` wiring to prevent regressions in recently changed paths. (P1)
- [ ] Migrate dashboard workspace to Tailwind CSS 4 while keeping existing shadcn component behavior stable. (P2)
- [ ] Add `playwright-report/` and `test-results/` to `.gitignore` (repo root) per dashboard E2E artifact contract. (P2)

### Completed
- [x] Implement markdown rendering for Docs view using `marked` or `react-markdown` instead of raw `<pre>` text. (P1)
- [x] Align README and command/prompt docs with canonical install paths and naming (`skills/$skillName`, `commands/$skillName`, slash command vs Copilot prompt forms) to remove remaining spec drift. (P0)
- [x] Bring setup discovery/scaffold parity with spec: include `reference_candidates` in discovery output, persist `reference_files` in project config, and substitute `{{REFERENCE_FILES}}` in generated prompts.
- [x] Added canonical `SPEC.md`.
- [x] Added all five Copilot prompt files.
- [x] Implemented `resolve`, `discover`, and `scaffold` CLI commands.
- [x] Implemented CLI build pipeline (`dist/index.js` plus dashboard assets).
- [x] Implemented dashboard APIs for steering and stop controls.
- [x] Updated installer runtime mapping for CLI distribution deployment.
- [x] Added installer test coverage (`install.tests.ps1`).
- [x] Added `PROMPT_steer.md` support in setup scaffolding.
- [x] Added initial dashboard server and frontend skeleton.
- [x] Expanded dashboard state to include active and recent sessions from runtime state files.
- [x] Integrated dashboard auto-launch into loop runtimes with URL output.
- [x] Added heartbeat SSE events, guarded state publish failures, and deterministic shutdown handling in dashboard runtime.
- [x] Replaced dashboard frontend placeholders with live state wiring (`/api/state` and `/events`).
- [x] Aligned steering behavior to write `STEERING.md` in the work directory across docs and runtime handling.
