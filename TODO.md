# Project TODO

## Current Phase: Dashboard and loop contract completion

### In Progress
- [ ] Raise `dashboard.ts` branch coverage to gate threshold by adding missing tests for `/api/stop` (`force: true`, `ESRCH`, `EPERM`), `/api/steer` (`overwrite: true`), and `resolveDefaultAssetsDir` fallback paths (priority: high).

### Up Next
- [ ] Expand dashboard backend state model to include `active.json`, `history.json`, and session `meta.json` so Session List can show real active/recent sessions per SPEC (priority: high).
- [ ] Replace placeholder dashboard frontend (`dashboard/src/App.tsx`) with real `/api/state` + SSE wiring for session list, progress, log, selected-session behavior, and live refresh (priority: high).
- [ ] Implement Docs tab markdown rendering (`marked` or `react-markdown`) from API-fed document content instead of placeholder text (priority: high).
- [ ] Integrate dashboard lifecycle into `bin/loop.ps1`: launch dashboard in background, expose URL in loop output, and stop it cleanly on loop exit (priority: high).
- [ ] Port the same dashboard lifecycle integration to `bin/loop.sh` for macOS/Linux parity (priority: high).
- [ ] Persist runtime registries consistently (`active.json`, `history.json`, session `meta.json`) across start/stop loop lifecycle so dashboard and status/stop/steer flows share one source of truth (priority: high).
- [ ] Align steering documentation with SPEC across `claude/skills/$skillName/SKILL.md`, `claude/commands/$skillName/steer.md`, and `copilot/prompts/aloop-steer.prompt.md` (priority: medium).
- [ ] Align installer/readme contract text: include `PROMPT_steer.md` in installer summary and update README harness path examples to installer `$skillName` destinations (priority: medium).
- [ ] Add uninstaller regression tests covering `-All`, `-DryRun`, `-Force`, and VS Code `aloop-*.prompt.md` cleanup behavior (priority: medium).
- [ ] Bring dashboard frontend toolchain in line with SPEC (Tailwind CSS 4 + markdown dependency + bundled dashboard delivery expectations) and add checks to prevent drift (priority: medium).

### Completed
- [x] Align steering-file contract to SPEC: write/consume `STEERING.md` from workdir (not session dir) across `dashboard.ts`, loop scripts, and tests.
- [x] Added canonical `SPEC.md` covering naming, harnesses, commands/prompts, runtime layout, installer/uninstaller contracts, and loop modes.
- [x] Added all five Copilot prompt files (`aloop-{setup,start,status,stop,steer}.prompt.md`) with matching YAML names.
- [x] Implemented `resolve`, `discover`, and `scaffold` command behavior in `$skillName/cli/src/commands/*.ts` with project scaffolding/discovery logic.
- [x] Implemented CLI build pipeline to produce `$skillName/cli/dist/index.js` plus bundled dashboard assets under `$skillName/cli/dist/dashboard`.
- [x] Implemented `POST /api/steer` and `POST /api/stop` in `$skillName/cli/src/commands/dashboard.ts` with explicit validation/error responses.
- [x] Updated installer runtime mapping to deploy `$skillName/cli/dist` into `~/.aloop/cli/`.
- [x] Added installer tests in `install.tests.ps1` for path mapping, harness command support, stale cleanup targets, and dry-run/force behavior.
- [x] Updated setup discovery scaffolding to include `PROMPT_steer.md` in generated prompt sets.
- [x] Added initial dashboard server/frontend skeleton with `/api/state`, `/events` SSE stream, and a basic UI shell.


