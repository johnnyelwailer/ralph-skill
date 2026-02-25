# Project TODO

## Current Phase: Dashboard and runtime spec parity

### In Progress

- [ ] [review] Gate 2: `$skillName/cli/src/commands/project.test.ts:308-314` (`workspace functions handle default parameters`) uses `assert.ok(result.project.root)` plus an empty `catch` around `scaffoldWorkspace()`; replace with concrete assertions (exact root path + `assert.rejects` on missing templates) so failures cannot be masked (priority: high).
- [ ] [review] Gate 2: `$skillName/cli/src/commands/project.test.ts:320-381` (`command wrappers support json and text output`) has shallow checks (`assert.ok(logs.length > 0)`, `assert.ok(scafJson.config_path)`) and another swallowed default-call failure; assert exact JSON/text fields for each wrapper and verify the default scaffold error path explicitly (priority: high).
- [ ] [review] Gate 3: branch coverage for touched `$skillName/cli/src/index.ts` is `0%` (`npx c8 --reporter=text --all --include='src/commands/*.ts' --include='src/index.ts' tsx --test src/**/*.test.ts`); add CLI entrypoint tests that execute command registration/parse branches to reach >=80% branch coverage for this touched file (priority: high).

### Up Next
- [ ] Extend `$skillName/cli/src/commands/dashboard.ts` with `POST /api/steer` and `POST /api/stop` handlers and explicit error responses (priority: critical; required dashboard controls per SPEC).
- [ ] Expand dashboard state loading/watch coverage in `dashboard.ts` to include `active.json`, `history.json`, and session `meta.json` expected by the session list UX (priority: high; current state only reads per-session status/log/docs).
- [ ] Replace placeholder dashboard UI in `$skillName/cli/dashboard/src/App.tsx` with `/api/state` + SSE-driven live data, session selection, and real Progress/Log views (priority: high; current UI is hardcoded sample data).
- [ ] Implement Docs rendering in the dashboard using a markdown renderer (`marked` or `react-markdown`) instead of static placeholder text (priority: high; required Docs tab behavior).
- [ ] Launch and manage dashboard lifecycle from `$skillName/bin/loop.ps1` (start background dashboard, print URL, update `active.json`, clean shutdown) (priority: high; required Windows integration).
- [ ] Port the same dashboard lifecycle behavior to `$skillName/bin/loop.sh` for macOS/Linux parity (priority: high; cross-platform contract parity).
- [ ] Wire `active.json`, `history.json`, and per-session `meta.json` updates consistently through loop/session lifecycle paths in both `.ps1` and `.sh` loops (priority: high; runtime layout contract gap).
- [ ] Update `install.ps1` summary and README to include `PROMPT_steer.md` and align install/architecture paths with installer `$skillName`-based harness destinations (priority: medium).
- [ ] Add regression tests for new installer CLI deployment mapping and add uninstaller coverage (`-All`, `-DryRun`, `-Force`, VS Code prompt cleanup) (priority: medium; prevents contract drift).

### Completed
- [x] [review] Gate 1: `{{REFERENCE_FILES}}` is hardcoded to empty in `$skillName/cli/src/commands/project.ts:370`, which misses SPEC template-variable intent; add discovery/option plumbing for reference files and assert scaffolded prompts render them (priority: high).
- [x] [review] Gate 2: tests in `$skillName/cli/src/commands/project.test.ts:8-51` are happy-path-only and miss failure/edge behaviors; add concrete assertions for missing template errors (`project.ts:332-333`), non-node language preset branches (`project.ts:181-194`), no-package fallback (`project.ts:162-163`), unknown provider hint fallback (`project.ts:308`), and non-git workspace detection (`project.ts:95-99`) (priority: high).
- [x] [review] Gate 3: branch coverage is below threshold for changed/new CLI logic (`npx c8 ...` reports `$skillName/cli/src/commands/project.ts` at 63.73% branch, below 90% new-module gate); raise coverage to >=90% for `project.ts` and add explicit tests for touched command wrappers `resolve.ts`, `discover.ts`, and `scaffold.ts` output modes (priority: high).
- [x] Implement CLI packaging pipeline end-to-end: build dashboard frontend assets and server output into `$skillName/cli/dist`, with runtime paths that can be installed directly (priority: critical).
- [x] Update `install.ps1` runtime mapping to copy `$skillName/cli/dist` into `~/.aloop/cli/` and include CLI/dashboard paths in the install summary (priority: critical; required before dashboard can run from installed runtime).
- [x] Implement real `resolve`, `discover`, and `scaffold` behavior in `$skillName/cli/src/commands/*.ts` (currently placeholders) so the CLI monorepo contract is not stubbed (priority: critical; foundational runtime contract gap).
- [x] Add canonical `SPEC.md` with naming, harness, command/prompt, runtime, installer, and uninstaller contracts.
- [x] Ensure all five Copilot prompt files exist with `aloop-*.prompt.md` names and matching YAML `name` fields.
- [x] Keep installer harness mapping aligned with `claude/skills/$skillName`, `claude/commands/$skillName`, and `$skillName/{config.yml,bin,templates}`.
- [x] Ensure stale cleanup removes legacy unsupported command directories for Copilot and Agents.
- [x] Keep uninstaller harness removals wired to installer `$skillName` paths and VS Code `aloop-*.prompt.md` cleanup.
- [x] Add installer test coverage in `install.tests.ps1` for mapping, `HasCommands`, stale cleanup, and `-DryRun`/`-Force` branches.
- [x] Update `setup-discovery.ps1` prompt scaffold loop to include `PROMPT_steer.md`.
- [x] Add initial dashboard server/frontend workspace skeleton (SSE endpoint, API state endpoint, and UI shell) as a base for remaining integration work.
