# Project TODO

## Current Phase: Dashboard and command-surface spec alignment

### In Progress
- [x] Replace dashboard frontend placeholders with real state wiring: load initial `/api/state`, subscribe to `/events` via `EventSource`, and render live Sessions/Progress/Docs/Log/Steer/Stop views from server data. (P0)

### Up Next
- [x] Expand dashboard server state to match SPEC: include active/recent sessions from `~/.aloop/active.json`/`history.json`, not just a single session's status/log/docs. (P0)
- [ ] Integrate dashboard lifecycle into loop runtime: auto-launch dashboard from `loop.ps1` and `loop.sh`, print URL on startup, and ensure clean shutdown handling. (P0)
- [ ] Add dashboard reliability fixes in `dashboard.ts`: SSE heartbeat, guarded `publishState()` error handling in debounce, and `process.on` signal handler behavior aligned with graceful shutdown. (P1)
- [ ] Correct steering contract docs/prompts to match runtime/spec: all steer flows should write/read `STEERING.md` in workdir (not session dir). Update Claude and Copilot steer docs accordingly. (P1)
- [ ] Align README and skill/command docs with canonical naming and install paths from `SPEC.md` (`skills/$skillName`, `commands/$skillName`, `/ralph:*` vs `/aloop-*` split by harness). (P1)
- [ ] Add/refresh tests for new dashboard behavior (SSE payload shape, active/history loading, frontend live updates) and steering path contract text regressions. (P1)
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
