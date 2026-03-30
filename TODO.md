# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Summary of what's done
- `DEFAULT_LOOP_SETTINGS` in `defaults.ts` — single source of truth for all defaults ✅
- `pipeline.yml` `loop:` section — has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc. ✅
- `loop.sh` / `loop.ps1` — read all loop settings from `loop-plan.json` at startup and hot-reload from `meta.json` each iteration ✅
- `compile-loop-plan.ts` — reads `loop:` section from pipeline.yml and embeds as `loopSettings` in `loop-plan.json` ✅
- `orchestrate.ts` scan loop — hot-reloads `scan_pass_throttle_ms`, `rate_limit_backoff`, `triage_interval` from state.json each iteration ✅
- `orchestrate.ts` — `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` are settable via CLI options ✅

## Remaining gaps

### In Progress

- [ ] [review] Gate 2+3: `compile-loop-plan.test.ts` line 847's loopSettings test does NOT verify the new issue-94 fields — add assertions for `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` (all in `numFields`). Use pipeline.yml content that sets e.g. `triage_interval: 10`, `scan_pass_throttle_ms: 45000`, `rate_limit_backoff: exponential` and assert the values appear in `loopPlanJson.loopSettings`. (priority: high)

- [ ] [review] Gate 4: `loop.sh` loads `TRIAGE_INTERVAL`, `SCAN_PASS_THROTTLE_MS`, `RATE_LIMIT_BACKOFF` via `load_loop_settings()` and `refresh_loop_settings_from_meta()` but never references them in any loop logic — 9 occurrences setting these vars, 0 uses. These are orchestrator-level settings that belong in orchestrate.ts, not in the inner loop runner. Remove them from `load_loop_settings`, the initializer block (lines 338-340), and `refresh_loop_settings_from_meta`. (priority: high)

- [ ] [review] Gate 2: `runOrchestratorScanLoop` backoff calculation (orchestrate.ts:5856-5876) — the three strategies `exponential`, `linear`, `fixed` each produce different sleep values but no unit test exercises them. Add a test for `runOrchestratorScanLoop` that sets `rate_limit_backoff: 'exponential'` and `consecutiveRateLimits > 0`, then asserts the sleep arg is `baseInterval * 2^(n-1)` vs. linear `baseInterval * n`. (priority: medium)

### Up Next

- [x] **Add `concurrency_cap` to pipeline.yml `loop:` section** — the `concurrency_cap` key is missing from pipeline.yml's `loop:` section; add it with default `3` so users can configure it without CLI args

- [x] **Read orchestrator settings from pipeline.yml at startup** — `orchestrateCommandWithDeps` only reads `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, and `concurrency_cap` from CLI options; add a `resolveOrchestratorSettingsFromConfig` function that falls back to pipeline.yml when CLI option is absent (similar to `resolveAutoMerge`). This requires removing the Commander default `'3'` for `--concurrency` and handling the default in code.

- [ ] **Tests: orchestrate command reads settings from pipeline.yml** — add tests to `orchestrate.test.ts` verifying that `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, and `concurrency_cap` are read from pipeline.yml when not provided via CLI args

### Completed

- [x] `DEFAULT_LOOP_SETTINGS` — single source of truth for defaults (`defaults.ts`)
- [x] pipeline.yml `loop:` section has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc.
- [x] loop.sh/loop.ps1 load all settings at startup from `loop-plan.json` and hot-reload from `meta.json`
- [x] compile-loop-plan.ts reads `loop:` section from pipeline.yml and embeds as `loopSettings`
- [x] orchestrate scan loop uses `state.triage_interval`, `state.scan_pass_throttle_ms`, `state.rate_limit_backoff` (hot-reload via state.json re-read each pass)
- [x] `rate_limit_backoff` strategy (exponential/linear/fixed) implemented in scan loop
- [x] `max_iterations` for child loops reads from `state.max_iterations` (not hardcoded 999999)
