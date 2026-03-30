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

- [x] [review] Gate 2+3: `compile-loop-plan.test.ts` line 847's loopSettings test does NOT verify the new issue-94 fields — add `triage_interval: 10`, `scan_pass_throttle_ms: 45000`, `rate_limit_backoff: exponential` to the pipeline.yml string in that test, then add assertions `assert.equal(loopPlanJson.loopSettings.triage_interval, 10)`, `assert.equal(loopPlanJson.loopSettings.scan_pass_throttle_ms, 45000)`, `assert.equal(loopPlanJson.loopSettings.rate_limit_backoff, 'exponential')`. (priority: high)

- [ ] [review] Gate 4: `loop.sh` loads `TRIAGE_INTERVAL`, `SCAN_PASS_THROTTLE_MS`, `RATE_LIMIT_BACKOFF` via `load_loop_settings()` and `refresh_loop_settings_from_meta()` but never references them in any loop logic — these are orchestrator-level settings that belong in orchestrate.ts, not in the inner loop runner. Remove the `("triage_interval", "TRIAGE_INTERVAL", int)` and `("scan_pass_throttle_ms", "SCAN_PASS_THROTTLE_MS", int)` entries from the `mappings` list in `load_loop_settings` (lines ~306-307), remove the `rate_limit_backoff`/`RATE_LIMIT_BACKOFF` export block from `load_loop_settings` (lines ~313-315), remove the initializer defaults at lines 338-340 (`TRIAGE_INTERVAL=5`, `SCAN_PASS_THROTTLE_MS=30000`, `RATE_LIMIT_BACKOFF="fixed"`), and remove the same three entries from `refresh_loop_settings_from_meta` (lines ~368-369, ~375-377). (priority: high)

- [ ] [review] Gate 2: `runOrchestratorScanLoop` backoff calculation (orchestrate.ts:5856-5876) — the three strategies `exponential`, `linear`, `fixed` each produce different sleep values but no unit test exercises them. Add a test to the `runOrchestratorScanLoop` describe block: set `rate_limit_backoff: 'exponential'` on the state, make a scan pass return a rate-limit signal so `consecutiveRateLimits` becomes > 0, then assert the sleep arg is `baseInterval * 2^(n-1)` (exponential) vs. `baseInterval * n` (linear). (priority: medium)

### Up Next

- [ ] **Tests: orchestrate command reads settings from pipeline.yml** — VERIFY: tests for `resolveOrchestratorSettingsFromConfig` are already present in `orchestrate.test.ts` lines 4621-4690, covering all four settings. Run `npm test` to confirm they pass. (priority: medium)

### Completed

- [x] `DEFAULT_LOOP_SETTINGS` — single source of truth for defaults (`defaults.ts`)
- [x] pipeline.yml `loop:` section has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc.
- [x] loop.sh/loop.ps1 load all settings at startup from `loop-plan.json` and hot-reload from `meta.json`
- [x] compile-loop-plan.ts reads `loop:` section from pipeline.yml and embeds as `loopSettings`
- [x] orchestrate scan loop uses `state.triage_interval`, `state.scan_pass_throttle_ms`, `state.rate_limit_backoff` (hot-reload via state.json re-read each pass)
- [x] `rate_limit_backoff` strategy (exponential/linear/fixed) implemented in scan loop
- [x] `max_iterations` for child loops reads from `state.max_iterations` (not hardcoded 999999)
- [x] **Add `concurrency_cap` to pipeline.yml `loop:` section** — key present with default `3`
- [x] **Read orchestrator settings from pipeline.yml at startup** — `resolveOrchestratorSettingsFromConfig` reads all four settings from pipeline.yml with CLI override support
- [x] **Tests: `resolveOrchestratorSettingsFromConfig`** — 6 tests covering defaults, yml-read, CLI override, partial merge, no-loop-section, and unreadable file (`orchestrate.test.ts` lines 4621-4690)
