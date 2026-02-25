# Project TODO

## Current Phase: Dashboard and loop contract completion

### Completed
- [x] Raise `dashboard.ts` branch coverage to gate threshold by adding missing tests for `/api/stop` (`force: true`, `ESRCH`, `EPERM`), `/api/steer` (`overwrite: true`), and `resolveDefaultAssetsDir` fallback paths (priority: high).
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


