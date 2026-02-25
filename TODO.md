# Project TODO

## Current Phase: Installer + dashboard spec parity

### In Progress
- [x] Fix runtime install path mismatch: ensure installer output contains `~/.aloop/cli/dist/index.js` so loop launchers (`loop.ps1` / `loop.sh`) can reliably start the dashboard CLI. (P0)

### Up Next
- [ ] Add Playwright E2E foundation in `<skill>/cli/dashboard/` (`@playwright/test`, config, and `test:e2e` script using the real dashboard server via `webServer`). (P1)
- [ ] Add first fixture-backed Playwright specs for the required flows: initial render, session list/status, progress view, docs markdown render, log view, steer write side effect, stop flow, nav switching, and SSE reconnect behavior. (P1)
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
