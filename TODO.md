# Issue #106: `aloop setup` ZDR config, settings table & non-interactive mode

## Current Phase: Implementation

### Up Next
- [x] Print settings table in non-interactive mode before scaffolding (setup.ts:127-141). Spec: "In non-interactive mode, print the table to stdout for verification." Currently non-interactive skips the display entirely.
- [x] Add required-value validation in non-interactive mode. Spec: "Validates all required values are provided, errors if missing." Currently no validation — missing `--provider` or `--mode` silently uses undefined defaults. Should error with a clear message listing missing flags.
- [ ] Generate `opencode.json` with `provider.zdr: true` when provider includes opencode/openrouter AND `data_privacy: private`. Spec: "Generate `opencode.json` with `provider.zdr: true` when OpenCode + OpenRouter + ZDR." No OpenRouter-specific ZDR logic exists in setup.ts or scaffold.ts today.
- [ ] Add ZDR and devcontainer auth-strategy schema documentation to `aloop/config.yml`. Spec lists this file explicitly. Currently config.yml has no mention of `zdr_enabled`, `data_classification`, or `devcontainer_auth_strategy`.
- [ ] Add/update tests for new behaviors: settings table output assertion, non-interactive validation errors, opencode.json generation, config.yml schema comments.

### Completed
- [x] Format settings display as a proper ASCII table with Setting/Value columns (formatSettingsTable helper)
- [x] Data privacy question in interactive setup (private/public prompt with ZDR warnings)
- [x] ZDR provider warnings for non-OpenRouter providers (claude, gemini, codex, copilot)
- [x] Devcontainer auth strategy question asked and stored in config
- [x] Config records `zdr_enabled` and `data_classification` via scaffold (project.mjs)
- [x] Non-interactive mode basic path (`--non-interactive` flag, skips prompts, calls scaffold)
- [x] Adjust/cancel confirmation flow in interactive mode
- [x] CLI flags: `--provider`, `--mode`, `--autonomy-level`, `--data-privacy`, `--devcontainer-auth-strategy`
