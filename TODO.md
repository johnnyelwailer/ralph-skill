# Project TODO

## Current Phase: Canonical naming and uninstall/prompt parity

### In Progress

- [x] **Add missing Copilot steer prompt file and wire command surface parity** — `copilot/prompts/$skillName-steer.prompt.md` is missing, so only four Copilot prompts exist. Add the fifth prompt (`name: aloop-steer`) and update any prompt-count assertions/docs accordingly. (priority: high — spec requires 5 Copilot prompts)

### Up Next

- [ ] **Normalize Claude/Codex command naming in docs/prompts to `/$skillName:*` contract** — command docs and README currently instruct `/aloop:*` for Claude/Codex, but spec requires `/$skillName:*` (Copilot remains `/aloop-*`). Update command markdown + README examples to remove this user-facing mismatch. (priority: high — command contract clarity)

- [ ] **Add/expand tests for uninstall contract and naming invariants** — there is good `install.ps1` coverage but no equivalent uninstaller regression suite. Add focused tests for harness path targets (`$skillName`), VS Code prompt glob (`aloop-*`), and runtime removal target (`~/.aloop/`). (priority: high — prevents cleanup regressions)

- [ ] **`loop.sh`: add agent-summary noise filtering parity with `loop.ps1`** — bash loop still lacks the PowerShell summary filter (`Show-AgentSummary` equivalent), so raw provider output remains noisy. Port filtering and concise tail summary behavior. (priority: medium — operator UX)

- [x] [review] **Add branch-coverage evidence for touched installer paths** — current plan still lacks explicit >=80% touched-file branch coverage evidence for installer logic branches (HasCommands, runtime copy paths, summary variants, dry-run/force paths). (priority: medium — review gate closure)

- [ ] **Deduplicate `Show-CheckboxMenu` helper across install/uninstall** — function is duplicated in both scripts; move to shared module/script and source it from both to reduce drift risk. (priority: low — maintainability)

### Completed

- [x] **Fix `uninstall.ps1` harness target mismatch (`aloop` vs installer `$skillName`)** — uninstaller currently removes `~/.{claude,codex,copilot,agents}/.../aloop` while installer deploys to `.../$skillName` (`ra`+`lph`). Switch uninstall harness paths to `$skillName`-based targets per spec while keeping VS Code prompt glob `aloop-*.prompt.md`. (priority: critical — current uninstall misses installed harness assets)
- [x] **Fix install path/source drift (legacy vs canonical naming)** — installer now maps from existing repo sources (`claude/skills/$skillName`, `claude/commands/$skillName`, `$skillName/{config.yml,bin,templates}`) and no longer depends on missing legacy paths.
- [x] [review] **Align `install.ps1` summary/usage text with 5-command contract** — installer output now lists `setup,start,status,stop,steer` and Copilot `aloop-*` prompt naming.
- [x] [review] **Add focused installer mapping/output tests (`install.tests.ps1`)** — tests now cover source/destination mapping, harness command capability flags, runtime roots, and summary/usage surface.
- [x] **Add canonical `SPEC.md` at repo root** — project now has explicit naming, harness, command/prompt, installer/uninstaller, and runtime contracts.
- [x] **`setup-discovery.ps1`: scaffold copies `PROMPT_steer.md` through full substitution loop**
- [x] **`loop.sh`: round-robin provider list filters to installed providers with warnings/errors**
- [x] **`loop.sh`: Copilot auth assertion detects common unauthenticated states**
