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

### Up Next

- [x] **Tests: orchestrate command reads settings from pipeline.yml** — VERIFIED: all 6 `resolveOrchestratorSettingsFromConfig` tests pass (defaults, yml-read, CLI override, partial merge, no-loop-section, unreadable file).

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
- [x] [review] Gate 2+3: `compile-loop-plan.test.ts` loopSettings test — assertions for `triage_interval: 10`, `scan_pass_throttle_ms: 45000`, `rate_limit_backoff: 'exponential'` verified present at lines 891-893
- [x] [review] Gate 4: `loop.sh` no longer loads `TRIAGE_INTERVAL`, `SCAN_PASS_THROTTLE_MS`, or `RATE_LIMIT_BACKOFF` — verified: none of these variables appear in `aloop/bin/loop.sh`
- [x] [review] Gate 2: `runOrchestratorScanLoop` backoff calculation — added `runScanPass?` injectable field to `ScanLoopDeps`, used in loop, and added 3 unit tests for exponential/linear/fixed strategies (`orchestrate.test.ts` `runOrchestratorScanLoop backoff strategies`)
