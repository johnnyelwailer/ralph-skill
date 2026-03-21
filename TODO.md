# Issue #106: `aloop setup` ZDR config, settings table & non-interactive mode

## Current Phase: Implementation

### Up Next
- [x] Generate `opencode.json` with `provider.zdr: true` when provider includes opencode AND `data_privacy: private`. In `scaffoldWorkspace()` (project.mjs), after copying opencode agent files (~line 988), write an `opencode.json` at project root with `{ "provider": { "zdr": true } }` when ZDR conditions are met. Spec: "Generate `opencode.json` with `provider.zdr: true` when OpenCode + OpenRouter + ZDR."
- [ ] Add ZDR and devcontainer auth-strategy schema documentation to `aloop/config.yml`. Add commented-out example sections showing `privacy_policy` (with `data_classification`, `zdr_enabled`, `require_data_retention_safe`) and `devcontainer_auth_strategy` fields. Spec lists this file explicitly.
- [x] [review] Gate 3: `getMissingNonInteractiveFlags` — add tests for single-missing-flag branches: (1) `{ provider: 'claude' }` without mode, (2) `{ mode: 'loop' }` without provider. Currently only both-missing is tested (setup.test.ts:664-700). (priority: medium)
- [ ] Add tests for opencode.json ZDR generation: verify `opencode.json` is written when opencode provider + private data, and NOT written when public data or non-opencode provider.

### Completed
- [x] Format settings display as a proper ASCII table with Setting/Value columns (formatSettingsTable helper)
- [x] Data privacy question in interactive setup (private/public prompt with ZDR warnings)
- [x] ZDR provider warnings for non-OpenRouter providers (claude, gemini, codex, copilot)
- [x] Devcontainer auth strategy question asked and stored in config
- [x] Config records `zdr_enabled` and `data_classification` via scaffold (project.mjs)
- [x] Non-interactive mode basic path (`--non-interactive` flag, skips prompts, calls scaffold)
- [x] Adjust/cancel confirmation flow in interactive mode
- [x] CLI flags: `--provider`, `--mode`, `--autonomy-level`, `--data-privacy`, `--devcontainer-auth-strategy`
- [x] Print settings table in non-interactive mode before scaffolding (setup.ts:172-183)
- [x] Add required-value validation in non-interactive mode (setup.ts:92-107, 161-167)
