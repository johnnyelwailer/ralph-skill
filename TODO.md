# Project TODO

## Current Phase: Bug fixes and parity gaps

### In Progress

_(none)_

### Up Next

- [ ] **loop.sh: add agent summary noise filtering** — `loop.ps1` has `Show-AgentSummary` (lines 190-250) that strips ANSI escapes, filters noise patterns (YOLO mode, cached credentials, codex banners, etc.), and shows only the last 8 meaningful lines. `loop.sh` uses raw `tee` output with no filtering. Port the noise-filtering logic to provide cleaner terminal output. (priority: medium — quality of life)

- [ ] **Copilot: add aloop-steer.prompt.md** — Claude/Codex have `steer.md` as a slash command but Copilot has no `aloop-steer.prompt.md`. Users on Copilot cannot steer a running loop from VS Code. Add `copilot/prompts/aloop-steer.prompt.md` mirroring the Claude steer command. Also update `install.ps1` summary output if needed. (priority: medium — feature parity)

- [ ] **Extract Show-CheckboxMenu into shared module** — `install.ps1` (line 222) and `uninstall.ps1` (line 24) contain identical ~90-line `Show-CheckboxMenu` function. Extract to `aloop/bin/ui-helpers.ps1` and dot-source it from both scripts. Reduces maintenance burden when the UI changes. (priority: low — code quality)

### Completed

- [x] **setup-discovery.ps1: scaffold must copy PROMPT_steer.md** [reviewed: gates 1-5 pass — steer template correctly processed through full substitution loop including {{SPEC_FILES}} and {{PROVIDER_HINTS}} placeholders]
- [x] **loop.sh: round-robin should filter to installed providers** [reviewed: gates 1-5 pass — faithful port of PS1 filter-and-warn logic with identical warn/error/reassign semantics]
- [x] **loop.sh: add copilot auth assertion** [reviewed: gates 1-5 pass — assert_copilot_auth matches all 4 PS1 auth-failure patterns; temp-file capture covers both early-return and normal-exit cleanup paths]
