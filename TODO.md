# Project TODO

## Current Phase: Spec compliance & Dashboard implementation

### In Progress

- [ ] **Fix VS Code prompt uninstall glob mismatch** — `uninstall.ps1` looks for `aloop-*.prompt.md` but they are installed as `ralph-*.prompt.md` (via `copilot/prompts/ralph-*.prompt.md`); align uninstaller to target `$skillName-*.prompt.md` correctly. (priority: critical — uninstall correctness)

### Up Next

- [~] **Implement `monitor.mjs` runtime server** — superseded by steering: dashboard must be implemented as a TypeScript CLI subcommand in a monorepo build (not standalone `.mjs`).

- [ ] **Set up TypeScript monorepo foundation for CLI** — add `ralph/cli/` TS workspace structure (`src/`, `tsconfig.json`, `package.json`) with build/bundle scripts and zero runtime dependencies. (priority: high — prerequisite for all CLI/dashboard work)

- [ ] **Migrate core CLI commands to TypeScript build output** — implement CLI entry/subcommand routing and move resolve/discover/scaffold command implementation to TS sources with bundled `dist` output. (priority: high — supersedes prior `.mjs` CLI direction)

- [ ] **Implement dashboard as CLI subcommand (`aloop dashboard`/`aloop monitor`)** — port the existing dashboard feature spec (layout, SSE, views, steer/stop actions) into TS CLI command module and include it in bundle output. (priority: high — core spec feature, new tech direction)

- [ ] **Wire dashboard into `loop.ps1`** — launch CLI dashboard subcommand in background, capture/display URL, and ensure graceful shutdown. (priority: high — required integration)

- [ ] **Wire dashboard into `loop.sh`** — port CLI dashboard subcommand launch and lifecycle management to Bash loop. (priority: high — required integration)

- [ ] **`loop.sh`: add agent-summary filtering parity with `loop.ps1`** — port `Show-AgentSummary` logic to Bash so output is clean and concise for operators. (priority: medium — usability parity)

- [ ] **Align setup commands with "scaffold reality"** — update `claude/commands/ralph/setup.md` and `copilot/prompts/ralph-setup.prompt.md` (Step 8) to include `PROMPT_steer.md` in the list of scaffolded files. (priority: high — correctness)

- [ ] **Update installer summary and README architecture** — update `install.ps1` summary to include the bundled CLI dashboard/runtime (`~/.aloop/cli/dist`) and `PROMPT_steer.md`. Fix `README.md` paths to use `$skillName/` instead of `aloop/` to match actual deployment. (priority: high — contract clarity)

- [ ] **Add uninstaller regression tests** — create `uninstall.tests.ps1` verifying cleanup of `$skillName` harness targets, VS Code prompt files, and `~/.aloop/` runtime root. (priority: high — prevent cleanup regressions)

- [ ] **Deduplicate `Show-CheckboxMenu` helper** — move the interactive menu function to a shared script and source it in both `install.ps1` and `uninstall.ps1`. (priority: low — maintainability)

### Completed

- [x] **Add missing Copilot steer prompt file and wire command surface parity** — `copilot/prompts/$skillName-steer.prompt.md` now exists (`name: aloop-steer`) and prompt-count checks include all five prompts. (priority: high)
- [x] **Normalize Claude/Codex command naming to `/$skillName:*` across user-facing docs** — command surface now consistently documents `/setup`, `/start`, `/status`, `/stop`, `/steer` under `/$skillName:*` for CLI harnesses. (priority: high)
- [x] [review] **Add branch-coverage evidence for touched installer paths** — behavioral tests in `install.tests.ps1` cover HasCommands, runtime copy paths, summary variants, and dry-run/force paths. (priority: medium)
- [x] **Fix `uninstall.ps1` harness target mismatch (`aloop` vs installer `$skillName`)** — uninstaller currently removes `~/.{claude,codex,copilot,agents}/.../aloop` while installer deploys to `.../$skillName` (`ra`+`lph`). Switch uninstall harness paths to `$skillName`-based targets per spec while keeping VS Code prompt glob `aloop-*.prompt.md`. (priority: critical — current uninstall misses installed harness assets)
- [x] **Fix install path/source drift (legacy vs canonical naming)** — installer now maps from existing repo sources (`claude/skills/$skillName`, `claude/commands/$skillName`, `$skillName/{config.yml,bin,templates}`) and no longer depends on missing legacy paths.
- [x] [review] **Align `install.ps1` summary/usage text with 5-command contract** — installer output now lists `setup,start,status,stop,steer` and Copilot `aloop-*` prompt naming.
- [x] [review] **Add focused installer mapping/output tests (`install.tests.ps1`)** — tests now cover source/destination mapping, harness command capability flags, runtime roots, and summary/usage surface.
- [x] **Add canonical `SPEC.md` at repo root** — project now has explicit naming, harness, command/prompt, installer/uninstaller, and runtime contracts.
- [x] **`setup-discovery.ps1`: scaffold copies `PROMPT_steer.md` through full substitution loop**
- [x] **`loop.sh`: round-robin provider list filters to installed providers with warnings/errors**
- [x] **`loop.sh`: Copilot auth assertion detects common unauthenticated states**
