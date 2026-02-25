# Project TODO

## Current Phase: Installer/runtime parity and command-surface alignment

### In Progress

- [x] **Fix install path/source drift (legacy vs canonical naming)** — `install.ps1` currently copies from non-existent `claude\skills\aloop`, `claude\commands\aloop`, and `aloop\...` runtime paths, while this repo contains the canonical skill/command/runtime tree. Update source paths, destination folders, and install summary text so a dry run no longer reports "Source not found" for core assets. (priority: critical — installer currently cannot deploy skill/runtime files)

### Up Next

- [x] **Add canonical `SPEC.md` for this repo** — planning prompts require `SPEC.md`, but it is missing at repo root. Create/curate a concise spec that defines canonical naming, supported harnesses, command/prompt surface (including steering), and runtime layout expected by installer/uninstaller/scripts. (priority: high — planning quality and consistency)

- [ ] **Align `uninstall.ps1` with canonical install targets** — ensure uninstall removes the same skill/command/runtime/prompt assets that install deploys after path/name normalization, including command naming and runtime root. (priority: high — prevents orphaned installs and mismatched cleanup)

- [ ] **Copilot parity: add steering prompt command** — Copilot prompt set has setup/start/status/stop prompt files only. Add an equivalent steer prompt and update installer/help output to list the fifth prompt command. (priority: medium — feature parity)

- [ ] **`loop.sh`: add agent summary noise filtering parity with `loop.ps1`** — port `Show-AgentSummary` behavior (ANSI stripping, noise-pattern filtering, last meaningful lines) so bash loop output matches PowerShell readability. (priority: medium — operator UX)

- [ ] **Consolidate duplicated `Show-CheckboxMenu` UI helper** — extract shared function from `install.ps1` and `uninstall.ps1` into a single module and dot-source it from both scripts. (priority: low — maintainability)

### Completed

- [x] **`setup-discovery.ps1`: scaffold copies `PROMPT_steer.md` through full substitution loop**
- [x] **`loop.sh`: round-robin provider list filters to installed providers with warnings/errors**
- [x] **`loop.sh`: Copilot auth assertion detects common unauthenticated states**
