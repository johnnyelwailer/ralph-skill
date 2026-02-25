# Project TODO

## Current Phase: Dashboard and command-surface spec alignment

### In Progress
- [~] [review] Gate 1: `ralph/bin/loop.ps1` dashboard lifecycle clean-shutdown gap. **Cancelled:** superseded by steering focus on adding dashboard Playwright E2E spec/test planning.
- [~] [review] Gate 2: Missing behavioral tests for loop runtime dashboard launch paths. **Cancelled:** steering redirects this cycle to browser-level Playwright E2E coverage.
- [~] [review] Gate 3: Branch coverage for `loop.ps1`/`loop.sh` below target. **Cancelled:** steering scope is additive dashboard E2E layer, not loop runtime branch coverage.
- [x] Replace dashboard frontend placeholders with real state wiring: load initial `/api/state`, subscribe to `/events` via `EventSource`, and render live Sessions/Progress/Docs/Log/Steer/Stop views from server data. (P0)

### Up Next
- [x] Expand dashboard server state to match SPEC: include active/recent sessions from `~/.aloop/active.json`/`history.json`, not just a single session's status/log/docs. (P0)
- [x] Integrate dashboard lifecycle into loop runtime: auto-launch dashboard from `loop.ps1` and `loop.sh`, print URL on startup, and ensure clean shutdown handling. (P0)
- [ ] Add dashboard reliability fixes in `dashboard.ts`: SSE heartbeat, guarded `publishState()` error handling in debounce, and `process.on` signal handler behavior aligned with graceful shutdown. (P1)
- [ ] Correct steering contract docs/prompts to match runtime/spec: all steer flows should write/read `STEERING.md` in workdir (not session dir). Update Claude and Copilot steer docs accordingly. (P1)
- [ ] Align README and skill/command docs with canonical naming and install paths from `SPEC.md` (`skills/$skillName`, `commands/$skillName`, `/ralph:*` vs `/aloop-*` split by harness). (P1)
- [ ] Add/refresh tests for new dashboard behavior (SSE payload shape, active/history loading, frontend live updates) and steering path contract text regressions. (P1)
- [ ] Add Playwright E2E tooling for dashboard in `ralph/cli/dashboard/` (or `ralph/cli/`): install `@playwright/test`, add `playwright.config.ts` with `webServer` startup for real `dashboard.ts`, and add `test:e2e` script. (P1)
- [ ] Create dashboard E2E fixture session data (`status.json`, `log.jsonl`, `active.json`, `TODO.md`) and wire tests to read/write fixture files for side-effect assertions. (P1)
- [ ] Add Playwright scenarios for dashboard load, SSE connect/update/reconnect, session list/status indicators, progress timeline badges, docs rendering, log stream autoscroll, steer submit side effect (`STEERING.md` in session dir), stop confirm + POST, and nav view switching. (P1)
- [ ] Add Playwright artifact ignores (`playwright-report/`, `test-results/`) to `.gitignore`. (P1)
- [ ] Remove tracked `testResults.xml` and ignore it in `.gitignore` to prevent machine-generated artifact churn. (P2)
- [ ] Add dark theme tokens (`.dark` CSS vars) and a dashboard theme toggle to match existing Tailwind `darkMode: ['class']` config. (P3)
- [ ] Refactor duplicated provider/model defaults in `project.ts` into shared constants to reduce drift across discovery/scaffold output. (P3)

### Completed
- [x] Added canonical `SPEC.md`
- [x] Added all five Copilot prompt files
- [x] Implemented `resolve`, `discover`, and `scaffold` CLI commands
- [x] Implemented CLI build pipeline (`dist/index.js` + dashboard assets)
- [x] Implemented `POST /api/steer` and `POST /api/stop` dashboard APIs
- [x] Updated installer runtime mapping for CLI dist deployment
- [x] Added installer tests (`install.tests.ps1`)
- [x] Added `PROMPT_steer.md` support in setup scaffolding
- [x] Added initial dashboard server and frontend skeleton
