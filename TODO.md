# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

- [x] Implement as described in the issue

## Implementation Notes

All settings from TASK_SPEC.md are already configurable:

- `triage_interval` - configurable via pipeline.yml, loop-settings.ts (default: 5)
- `max_iterations` - configurable via pipeline.yml, loop-settings.ts (default: 50)
- `concurrency_cap` - configurable via pipeline.yml, loop-settings.ts (default: 3)
- `rate_limit_backoff` - configurable via pipeline.yml, loop-settings.ts (default: 'fixed')
- `scan_pass_throttle_ms` - configurable via pipeline.yml, loop-settings.ts (default: 30000)

Hot-reload is implemented:
- PowerShell: `Refresh-LoopSettingsFromMeta()` (loop.ps1 lines 147-176)
- Bash: `refresh_loop_settings_from_meta()` (loop.sh lines 345-387)

Configuration sources (in precedence order):
1. CLI flags (highest)
2. meta.json (hot-reloadable at runtime)
3. loop-plan.json (compiled from pipeline.yml)
4. pipeline.yml (project defaults)
5. defaults.ts (hardcoded fallbacks)
