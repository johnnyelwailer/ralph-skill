# Project TODO

## Current Phase: Bug fixes and parity gaps

### In Progress

- [x] **setup-discovery.ps1: scaffold must copy PROMPT_steer.md** — The scaffold function (line 574) only generates plan/build/review prompts. The steer template is never copied to `~/.aloop/projects/<hash>/prompts/`, so when `start.md` copies prompts to the session directory, `PROMPT_steer.md` is missing. The loop detects `STEERING.md` but warns "PROMPT_steer.md is missing" and skips steering entirely. Fix: add `'steer'` to the `@('plan', 'build', 'review')` foreach loop, but note the steer template has no project-specific variables to substitute (no `{{VALIDATION_COMMANDS}}` etc.), so it can be a straight copy from `~/.aloop/templates/PROMPT_steer.md`. (priority: critical — steering is completely broken)

- [x] **loop.sh: round-robin should filter to installed providers** — `loop.ps1` (lines 612-628) gracefully filters the round-robin list to only installed CLIs and warns about missing ones. `loop.sh` (line 507) hard-fails with `assert_provider_installed` for every provider in the list, so specifying `--round-robin claude,codex,gemini,copilot` on a machine missing gemini kills the entire loop. Fix: port the filter-and-warn logic from loop.ps1 to loop.sh. This was fixed in loop.ps1 per commit `3bf1431` but never ported to the bash version. (priority: high — breaks round-robin on partial installs)

- [x] **loop.sh: add copilot auth assertion** — `loop.ps1` has `Assert-CopilotAuth` (line 126-131) that checks copilot output for auth failure strings (`No authentication information found`, `Failed to log in`, etc.) and throws a hard error. `loop.sh` has no equivalent — copilot auth failures silently pass as successful iterations. Fix: add an `assert_copilot_auth` function in loop.sh that greps the output for the same patterns. (priority: high — silent auth failures waste iterations)

### Up Next

- [ ] **loop.sh: add agent summary noise filtering** — `loop.ps1` has `Show-AgentSummary` (lines 190-250) that strips ANSI escapes, filters noise patterns (YOLO mode, cached credentials, codex banners, etc.), and shows only the last 8 meaningful lines. `loop.sh` uses raw `tee` output with no filtering. Port the noise-filtering logic to provide cleaner terminal output. (priority: medium — quality of life)

- [ ] **Copilot: add aloop-steer.prompt.md** — Claude/Codex have `steer.md` as a slash command but Copilot has no `aloop-steer.prompt.md`. Users on Copilot cannot steer a running loop from VS Code. Add `copilot/prompts/aloop-steer.prompt.md` mirroring the Claude steer command. Also update `install.ps1` summary output if needed. (priority: medium — feature parity)

- [ ] **Extract Show-CheckboxMenu into shared module** — `install.ps1` (line 222) and `uninstall.ps1` (line 24) contain identical ~90-line `Show-CheckboxMenu` function. Extract to `aloop/bin/ui-helpers.ps1` and dot-source it from both scripts. Reduces maintenance burden when the UI changes. (priority: low — code quality)

### Completed

_(none yet)_
