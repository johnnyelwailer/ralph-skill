# Project TODO

## Current Phase: Command contract alignment and regression coverage

### In Progress

- [x] **Normalize Claude/Codex command naming to `/$skillName:*` across user-facing docs** — README, Claude command files, and skill reference docs still instruct `/aloop:*`; spec requires `/$skillName:*` for Claude/Codex (Copilot remains `/aloop-*`). (priority: high — command contract correctness)

### Up Next

- [ ] **Align installer summary text with 4-template runtime contract** — `install.ps1` copies `PROMPT_steer.md` but summary output still lists only `PROMPT_{plan,build,review}.md`; update summary/help text to reflect actual runtime layout. (priority: high — avoids operator confusion)

- [ ] **Add/expand tests for uninstall contract and naming invariants** — there is good `install.ps1` coverage but no equivalent uninstaller regression suite. Add focused tests for harness path targets (`$skillName`), VS Code prompt glob (`aloop-*`), and runtime removal target (`~/.aloop/`). (priority: high — prevents cleanup regressions)

- [ ] **`loop.sh`: add agent-summary noise filtering parity with `loop.ps1`** — bash loop still lacks the PowerShell summary filter (`Show-AgentSummary` equivalent), so raw provider output remains noisy. Port filtering and concise tail summary behavior. (priority: medium — operator UX)

- [ ] **Deduplicate `Show-CheckboxMenu` helper across install/uninstall** — function is duplicated in both scripts; move to shared module/script and source it from both to reduce drift risk. (priority: low — maintainability)

### Completed

- [x] **Add missing Copilot steer prompt file and wire command surface parity** — `copilot/prompts/$skillName-steer.prompt.md` now exists (`name: aloop-steer`) and prompt-count checks include all five prompts. (priority: high)
- [x] [review] **Add branch-coverage evidence for touched installer paths** — behavioral tests in `install.tests.ps1` cover HasCommands, runtime copy paths, summary variants, and dry-run/force paths. (priority: medium)
- [x] **Fix `uninstall.ps1` harness target mismatch (`aloop` vs installer `$skillName`)** — uninstaller currently removes `~/.{claude,codex,copilot,agents}/.../aloop` while installer deploys to `.../$skillName` (`ra`+`lph`). Switch uninstall harness paths to `$skillName`-based targets per spec while keeping VS Code prompt glob `aloop-*.prompt.md`. (priority: critical — current uninstall misses installed harness assets)
- [x] **Fix install path/source drift (legacy vs canonical naming)** — installer now maps from existing repo sources (`claude/skills/$skillName`, `claude/commands/$skillName`, `$skillName/{config.yml,bin,templates}`) and no longer depends on missing legacy paths.
- [x] [review] **Align `install.ps1` summary/usage text with 5-command contract** — installer output now lists `setup,start,status,stop,steer` and Copilot `aloop-*` prompt naming.
- [x] [review] **Add focused installer mapping/output tests (`install.tests.ps1`)** — tests now cover source/destination mapping, harness command capability flags, runtime roots, and summary/usage surface.
- [x] **Add canonical `SPEC.md` at repo root** — project now has explicit naming, harness, command/prompt, installer/uninstaller, and runtime contracts.
- [x] **`setup-discovery.ps1`: scaffold copies `PROMPT_steer.md` through full substitution loop**
- [x] **`loop.sh`: round-robin provider list filters to installed providers with warnings/errors**
- [x] **`loop.sh`: Copilot auth assertion detects common unauthenticated states**
