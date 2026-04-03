# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

- [x] Implement as described in the issue

## Implementation Notes

All configuration values are now data-driven:
- **triage_interval**: Configurable via pipeline.yml (default: 5), hot-reloadable via meta.json
- **max_iterations**: Configurable via pipeline.yml (default: 50), hot-reloadable via meta.json
- **concurrency_cap**: Configurable via pipeline.yml (default: 3), hot-reloadable via meta.json
- **rate_limit_backoff**: Configurable via pipeline.yml (default: 'fixed'), hot-reloadable via meta.json
- **scan_pass_throttle_ms**: Configurable via pipeline.yml (default: 30000), hot-reloadable via meta.json

Hot-reload mechanism:
- Orchestrator: `mergeLoopSettingsFromMeta()` in orchestrate.ts
- Child loops: `refresh_loop_settings_from_meta()` in loop.sh/loop.ps1
- Config source: `loop_settings` field in meta.json takes precedence over orchestrator.json
- Defaults: Single source of truth in `defaults.ts`
