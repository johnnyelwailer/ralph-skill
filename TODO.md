# Project TODO

## Current Phase: Dashboard + runtime contract completion

### In Progress
- [x] [review] Strengthen weak assertions in `$skillName/cli/src/commands/project.test.ts` default-parameter tests (`workspace functions handle default parameters`, `command wrappers support json and text output`) by removing swallowed failures and asserting concrete expected outputs/errors (priority: high).
- [x] [review] Add CLI entrypoint coverage for `$skillName/cli/src/index.ts` command registration/parse branches; current coverage is 0% branch for this touched file (`npx c8 --reporter=text --all --include='src/commands/*.ts' --include='src/index.ts' tsx --test src/**/*.test.ts`) (priority: high).

### Up Next
- [x] Implement `POST /api/steer` and `POST /api/stop` in `$skillName/cli/src/commands/dashboard.ts` with explicit validation and error responses (priority: critical; required dashboard controls).
- [ ] Expand dashboard state model/loading in `$skillName/cli/src/commands/dashboard.ts` to include `active.json`, `history.json`, and session `meta.json` (priority: high; required session list contract).
- [ ] Replace placeholder UI in `$skillName/cli/dashboard/src/App.tsx` with real `/api/state` + SSE-driven session/progress/log views, wired steer/stop actions, and selected-session behavior (priority: high).
- [ ] Implement Docs tab markdown rendering (`marked` or `react-markdown`) in dashboard frontend and render real document content from API state (priority: high).
- [ ] Integrate dashboard lifecycle into `$skillName/bin/loop.ps1`: launch background dashboard process, print URL, and ensure clean shutdown handling (priority: high).
- [ ] Port the same dashboard lifecycle integration to `$skillName/bin/loop.sh` for macOS/Linux parity (priority: high).
- [ ] Persist runtime session registries across loop lifecycle: write/update `active.json`, `history.json`, and per-session `meta.json` consistently in loop paths (priority: high).
- [ ] Align installer/readme contract text: include `PROMPT_steer.md` in install summary and fix harness path documentation to use installer `$skillName` destinations (`~/.{claude,codex,copilot,agents}/skills/$skillName`) (priority: medium).
- [ ] Add uninstaller regression tests for `-All`, `-DryRun`, `-Force`, and VS Code `aloop-*.prompt.md` cleanup behavior (priority: medium).
- [ ] Bring dashboard frontend stack in line with SPEC monorepo contract (Tailwind CSS 4 + markdown dependency + bundled delivery expectations) and add build/test checks to prevent drift (priority: medium).

### Completed
- [x] Added canonical `SPEC.md` covering naming, harnesses, commands/prompts, runtime layout, installer/uninstaller contracts, and loop modes.
- [x] Added all five Copilot prompt files (`aloop-{setup,start,status,stop,steer}.prompt.md`) with matching YAML names.
- [x] Implemented `resolve`, `discover`, and `scaffold` command behavior in `$skillName/cli/src/commands/*.ts` with project scaffolding/discovery logic.
- [x] Implemented CLI build pipeline to produce `$skillName/cli/dist/index.js` plus bundled dashboard assets under `$skillName/cli/dist/dashboard`.
- [x] Updated installer runtime mapping to deploy `$skillName/cli/dist` into `~/.aloop/cli/`.
- [x] Added installer tests in `install.tests.ps1` for path mapping, harness command support, stale cleanup targets, and dry-run/force behavior.
- [x] Updated setup discovery scaffolding to include `PROMPT_steer.md` in generated prompt sets.
- [x] Added initial dashboard server/frontend skeleton with `/api/state`, `/events` SSE stream, and a basic UI shell.


