# Project TODO

## Current Phase: CLI/dashboard contract implementation and spec parity

### In Progress
- [x] Create `aloop/cli/` TypeScript workspace skeleton (`src/`, `commands/`, build config) and add a minimal entrypoint for `resolve/discover/scaffold/dashboard`. (priority: critical - prerequisite for all dashboard runtime work)

### Up Next
- [x] Build dashboard frontend workspace at `aloop/cli/dashboard/` (React + Tailwind 4 + shadcn/ui) with `Progress`, `Docs`, `Log`, `Steer`, and `Stop` views. (priority: high - required by SPEC dashboard architecture)
- [ ] Implement `commands/dashboard.ts` server with SSE and file-watch updates for `status.json`, `log.jsonl`, and work-dir docs. (priority: high - required live progress behavior)
- [ ] Add CLI build pipeline (`vite build` for dashboard assets + `esbuild`/`tsc` for server) to produce installable output under `aloop/cli/dist`. (priority: high - needed for runtime deployment contract)
- [ ] Update `install.ps1` to deploy CLI bundle from `aloop/cli/dist` into `~/.aloop/cli/` and include CLI runtime paths in install summary. (priority: high - installer/runtime contract gap)
- [ ] Launch and manage dashboard process from `aloop/bin/loop.ps1` (startup, URL output, cleanup on exit). (priority: high - Windows runtime integration)
- [ ] Port dashboard launch/lifecycle handling to `aloop/bin/loop.sh` for macOS/Linux parity. (priority: high - cross-platform runtime parity)
- [ ] Add session registry/metadata writes expected by SPEC (`active.json`, `history.json`, and per-session `meta.json`) and keep them synchronized with loop lifecycle. (priority: high - dashboard/session model contract gap)
- [ ] Add `uninstall.tests.ps1` covering harness path removal, VS Code `aloop-*.prompt.md` cleanup, and runtime `~/.aloop/` removal branches (`-All`, `-DryRun`, `-Force`). (priority: high - missing regression coverage)
- [ ] Update `README.md` install/architecture sections to replace legacy `skills/aloop` and `commands/aloop` paths with installer `$skillName` (`aloop`) paths. (priority: medium - docs/spec mismatch)
- [ ] Update setup docs (`claude/commands/aloop/setup.md`, `copilot/prompts/aloop-setup.prompt.md`) so scaffold output lists `PROMPT_{plan,build,review,steer}.md`. (priority: medium - command/prompt contract mismatch)
- [ ] Add installer tests for new CLI bundle mapping and summary text once CLI deployment is implemented. (priority: medium - prevents future contract drift)
- [ ] Port PowerShell `Show-AgentSummary` noise filtering behavior to `loop.sh` summary output. (priority: low - operator UX parity)
- [ ] Deduplicate `Show-CheckboxMenu` between `install.ps1` and `uninstall.ps1` via shared helper. (priority: low - maintainability)

### Completed
- [x] Add canonical `SPEC.md` at repo root with naming, harness, command/prompt, installer/uninstaller, and runtime contracts.
- [x] Ensure Copilot prompt files use `aloop-*.prompt.md` naming and include all five prompts (setup/start/status/stop/steer).
- [x] Fix `uninstall.ps1` harness targets to use installer `$skillName` paths for `~/.{claude,codex,copilot,agents}/.../$skillName`.
- [x] Keep installer harness mapping aligned with canonical sources (`claude/skills/$skillName`, `claude/commands/$skillName`, `$skillName/{config.yml,bin,templates}`).
- [x] Add installer coverage in `install.tests.ps1` for harness mapping, `HasCommands`, summary surface, stale cleanup, and `-DryRun`/`-Force` branches.
- [x] Update `setup-discovery.ps1` scaffold template copy loop to include `PROMPT_steer.md`.
- [x] Improve `loop.sh` provider handling with round-robin installed-provider filtering and Copilot auth assertion checks.
