# Project TODO

## Current Phase: Contract parity and dashboard completion

### In Progress
- [ ] Align README and command/prompt docs with canonical install paths and naming (`skills/$skillName`, `commands/$skillName`, slash command vs Copilot prompt forms) to remove remaining spec drift. (P0)

### Up Next
- [ ] Implement markdown rendering for Docs view using `marked` or `react-markdown` instead of raw `<pre>` text. (P1)
- [ ] Make dashboard frontend delivery self-contained per spec (single served HTML with inlined CSS/JS) and adjust server asset loading accordingly. (P1)
- [ ] Add Playwright E2E tooling in the dashboard workspace (`@playwright/test`, config with `webServer`, and `test:e2e` scripts). (P1)
- [ ] Add fixture-backed Playwright scenarios for layout, SSE updates/reconnect, session list/status, progress timeline badges, docs markdown rendering, log stream behavior, steer side effects, stop flow, and nav switching. (P1)
- [ ] Verify dashboard server branch coverage and add focused tests until review gate target is met (read-error branches, SSE client cleanup, and `/events` initial-state error path). (P1)
- [ ] Migrate dashboard workspace to Tailwind CSS 4 and current shadcn expectations from spec. (P2)
- [ ] Consolidate duplicated provider/model default literals into shared constants consumed by discovery/scaffold and loop entrypoints. (P2)
- [ ] Update repo ignore/cleanup for generated artifacts (`playwright-report/`, `test-results/`) and stop tracking transient test output files. (P2)

### Completed
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
