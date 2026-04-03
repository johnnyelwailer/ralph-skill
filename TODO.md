# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

- [x] Implement as described in the issue
- [ ] [qa/P1] Hot-reload loop settings from meta.json is non-functional: `aloop start` creates meta.json without a `loop_settings` key, so `refresh_loop_settings_from_meta()` in loop.sh always exits early (silently no-ops). README says "changes to meta.json take effect on the next iteration" but this is false — meta.json never gets `loop_settings` populated at session start. loop-plan.json has `loopSettings` (camelCase) with correct pipeline.yml values, but meta.json has neither `loopSettings` nor `loop_settings`. Fix: `aloop start` should write pipeline.yml loop settings to `meta.json["loop_settings"]` (snake_case). Tested at iter 5. (priority: high)