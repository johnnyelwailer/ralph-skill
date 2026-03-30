# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Summary of what's done
- `DEFAULT_LOOP_SETTINGS` in `defaults.ts` — single source of truth for all defaults ✅
- `pipeline.yml` `loop:` section — has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc. ✅
- `loop.sh` — reads all loop settings from `loop-plan.json` at startup and hot-reloads from `meta.json` each iteration, including `provider_timeout` → `PROVIDER_TIMEOUT` ✅
- `loop.ps1` — reads most loop settings, but **missing `provider_timeout` → `ProviderTimeoutSec` mapping** ⚠️
- `compile-loop-plan.ts` — reads `loop:` section from pipeline.yml and embeds as `loopSettings` in `loop-plan.json` ✅
- `orchestrate.ts` scan loop — hot-reloads `scan_pass_throttle_ms`, `rate_limit_backoff`, `triage_interval` from state.json each iteration ✅
- `orchestrate.ts` — `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` are settable via CLI options ✅

## Remaining gaps

### In Progress

- [x] [review] Gate 9 + loop.ps1 gap: added `provider_timeout` → `ProviderTimeoutSec` mapping to both `Load-LoopSettings` and `Refresh-LoopSettingsFromMeta` in `loop.ps1`; updated README.md to mark `provider_timeout` as fully implemented and added it to the YAML example.

### Up Next

- [x] [spec-gap] **P2: `provider_timeout` compile→load chain is broken** — fixed in `compile-loop-plan.ts` and `loop.sh`; `loop.ps1` gap tracked in the task above.

- [x] [spec-gap] **P3: `concurrency_cap` in `LoopSettings` interface is dead code** — removed from `LoopSettings` interface in `compile-loop-plan.ts`.

- [ ] [spec-gap] **P3: SPEC.md loop-plan.json format example missing `loopSettings`** — SPEC.md lines 3638-3653 show the `loop-plan.json` format with only `cycle`, `cyclePosition`, `iteration`, `version` — no `loopSettings`. The actual compiled artifact includes `loopSettings` whenever `pipeline.yml` has a `loop:` section. Fix: update SPEC.md example to include a `loopSettings` object with representative fields, or add a note that it is conditionally present.

### Completed

- [x] `DEFAULT_LOOP_SETTINGS` — single source of truth for defaults (`defaults.ts`)
- [x] pipeline.yml `loop:` section has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc.
- [x] loop.sh loads all settings at startup from `loop-plan.json` and hot-reloads from `meta.json`
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
