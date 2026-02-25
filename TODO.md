# Project TODO

## Current Phase: Dashboard spec hardening and contract alignment

### In Progress
- [x] Align steering contract to workdir across command/prompt/skill docs and spec references (replace session-dir STEERING guidance with workdir guidance). (P0)

### Up Next
- [x] Harden dashboard SSE/runtime behavior: add heartbeat events, guard `publishState()` failures, and make shutdown signal handling deterministic. (P0)
- [ ] Implement markdown rendering in dashboard Docs view using `marked` or `react-markdown` (replace plain text `<pre>` rendering). (P1)
- [ ] Make dashboard frontend delivery self-contained per spec (single served HTML with inlined CSS/JS) and update server asset loading accordingly. (P1)
- [ ] Add Playwright E2E tooling for dashboard (`@playwright/test`, config with `webServer`, and `test:e2e` scripts). (P1)
- [ ] Add fixture-backed dashboard E2E scenarios: initial layout, SSE update/reconnect, session list/status, progress badges, docs markdown rendering, log stream/autoscroll, steer side effect, stop flow, and view navigation. (P1)
- [ ] Add targeted tests for dashboard reliability paths (heartbeat/publish failure/signal shutdown) and steering contract regressions. (P1)
- [ ] Align README and command docs with canonical naming/install paths (`skills/$skillName`, `commands/$skillName`, `/$skillName:*` vs `/aloop-*`) plus steering path behavior. (P1)
- [ ] Migrate dashboard workspace to Tailwind CSS 4 + current shadcn expectations from spec. (P2)
- [ ] Consolidate duplicated provider/model default literals into shared constants used by discovery/scaffold and loop entrypoints. (P2)
- [ ] Update repo ignores/cleanup for generated artifacts: `playwright-report/`, `test-results/`, and tracked `testResults.xml`. (P2)

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
- [x] Expanded dashboard state to include active/recent sessions from runtime (`active.json` and `history.json`)
- [x] Integrated dashboard auto-launch into loop runtimes (`loop.ps1` and `loop.sh`) with URL output
- [x] Replaced dashboard frontend placeholders with live state wiring (`/api/state` + `/events`)
