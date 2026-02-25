# Project TODO

## Current Phase: Spec compliance hardening and CLI/dashboard foundation

### In Progress
- [x] **Fix VS Code prompt uninstall mismatch** — renamed `copilot/prompts/` files to `aloop-*.prompt.md` to match the pattern expected by `uninstall.ps1` and documented in `SPEC.md`. (priority: critical — uninstall correctness)

### Up Next
- [ ] **Resolve prompt filename contract inconsistency in spec/docs vs scripts** — normalize the expected Copilot prompt filename pattern across `SPEC.md`, `README.md`, installer, and uninstaller so one canonical rule exists. (priority: high — prevents recurring install/uninstall drift)
- [ ] **Add uninstaller regression tests** — create `uninstall.tests.ps1` for harness path cleanup, VS Code prompt cleanup, and runtime (`~/.aloop`) removal behavior. (priority: high — safety for cleanup changes)
- [ ] **Align setup instructions with scaffold output** — update `claude/commands/agent/setup.md` and `copilot/prompts/aloop-setup.prompt.md` Step 8 prompt list to include `PROMPT_steer.md`. (priority: high — command correctness)
- [~] **Create TypeScript CLI workspace skeleton** — superseded by steering: dashboard now requires a dedicated React/Tailwind/shadcn frontend workspace under `aloop/cli/dashboard/`. (priority: high — prerequisite changed)
- [ ] **Implement CLI command modules for parity flows** — move/implement `resolve`, `discover`, and `scaffold` command logic in TS CLI sources so runtime can execute via bundled CLI entrypoint. (priority: high — prerequisite for dashboard launch contract)
- [~] **Implement dashboard CLI subcommand** — superseded by steering: implementation must serve a bundled React/Tailwind/shadcn frontend instead of the previous frontend approach. (priority: high — scope amended)
- [~] **Update installer for CLI bundle deployment** — superseded by steering: destination changed from `~/.aloop/cli/dist/` to `~/.aloop/cli/` for bundled server+frontend output. (priority: high — contract amended)
- [ ] **Create dashboard frontend workspace (React + Tailwind + shadcn/ui)** — add `aloop/cli/dashboard/` with `App.tsx`, shadcn component sources, views (`Progress/Docs/Log/Steer/Stop`), and markdown rendering (`marked` or `react-markdown`). (priority: high — required by steering)
- [ ] **Implement dashboard build pipeline for bundled output** — wire `vite build` (or equivalent) for inlined dashboard assets plus CLI server build (`esbuild`/`tsc`) to emit installable output consumed by `commands/dashboard.ts`. (priority: high — required by steering)
- [ ] **Update installer for new CLI output contract** — copy built CLI output to `~/.aloop/cli/` (not `~/.aloop/cli/dist/`) and keep summary text aligned with installed runtime layout. (priority: high — required by steering)
- [ ] **Update README architecture/install contract** — document `$skillName` harness paths consistently and include CLI runtime layout (`~/.aloop/cli/`, with `dist/index.js`) plus `PROMPT_steer.md` where applicable. (priority: high — user-facing accuracy)
- [ ] **Wire dashboard launch into `loop.ps1`** — start/track dashboard process, print monitor URL, and ensure graceful lifecycle handling. (priority: high — runtime integration)
- [ ] **Wire dashboard launch into `loop.sh`** — port dashboard startup/lifecycle handling to Bash loop for macOS/Linux parity. (priority: high — cross-platform integration)
- [ ] **Port agent-summary filtering to `loop.sh`** — add output-noise filtering equivalent to `Show-AgentSummary` in `loop.ps1`. (priority: medium — operator UX parity)
- [ ] **Deduplicate `Show-CheckboxMenu` helper** — extract shared UI helper consumed by both `install.ps1` and `uninstall.ps1`. (priority: low — maintainability)

### Completed
- [x] **Add missing Copilot steer prompt file and wire command surface parity** — `copilot/prompts/$skillName-steer.prompt.md` exists (`name: aloop-steer`) and prompt-count checks include all five prompts.
- [x] **Normalize Claude/Codex command naming to `/$skillName:*` across user-facing docs** — command surface consistently documents `/setup`, `/start`, `/status`, `/stop`, `/steer` under `/$skillName:*` for CLI harnesses.
- [x] **Add branch-coverage evidence for touched installer paths** — behavioral tests in `install.tests.ps1` cover HasCommands, runtime copy paths, summary variants, and dry-run/force paths.
- [x] **Fix `uninstall.ps1` harness target mismatch (`aloop` vs installer `$skillName`)** — uninstaller now targets `~/.{claude,codex,copilot,agents}/.../$skillName` to match installer output.
- [x] **Fix install path/source drift (legacy vs canonical naming)** — installer maps from repo sources (`claude/skills/$skillName`, `claude/commands/$skillName`, `$skillName/{config.yml,bin,templates}`) without missing legacy paths.
- [x] **Align `install.ps1` summary/usage text with 5-command contract** — installer output lists `setup,start,status,stop,steer` and Copilot `aloop-*` prompt command surface.
- [x] **Add focused installer mapping/output tests (`install.tests.ps1`)** — tests cover source/destination mapping, harness command capability flags, runtime roots, and summary/usage surface.
- [x] **Add canonical `SPEC.md` at repo root** — explicit naming, harness, command/prompt, installer/uninstaller, and runtime contracts are documented.
- [x] **`setup-discovery.ps1`: scaffold copies `PROMPT_steer.md` through full substitution loop**
- [x] **`loop.sh`: round-robin provider list filters to installed providers with warnings/errors**
- [x] **`loop.sh`: Copilot auth assertion detects common unauthenticated states**
