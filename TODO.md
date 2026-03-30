# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Summary of what's done
- `DEFAULT_LOOP_SETTINGS` in `defaults.ts` — single source of truth for all defaults ✅
- `pipeline.yml` `loop:` section — has `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `max_iterations`, etc. ✅
- `loop.sh` — reads all loop settings from `loop-plan.json` at startup and hot-reloads from `meta.json` each iteration, including `provider_timeout` → `PROVIDER_TIMEOUT` ✅
- `loop.ps1` — reads all loop settings including `provider_timeout` → `ProviderTimeoutSec` in both `Load-LoopSettings` and `Refresh-LoopSettingsFromMeta` ✅
- `compile-loop-plan.ts` — reads `loop:` section from pipeline.yml and embeds as `loopSettings` in `loop-plan.json` ✅
- `orchestrate.ts` scan loop — hot-reloads `scan_pass_throttle_ms`, `rate_limit_backoff`, `triage_interval` from state.json each iteration ✅
- `orchestrate.ts` — `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` are settable via CLI options ✅

## Remaining gaps

### In Progress

- [x] [build] Gate 9: `README.md:130` — "The orchestrator reads `concurrency_cap` from `pipeline.yml` (at root level, not under `loop:`)\" is inaccurate. The canonical `.aloop/pipeline.yml` has `concurrency_cap: 3` under the `loop:` section, directly contradicting the README's instruction and YAML example (which shows root-level `concurrency_cap: 5`). Fix: (1) change line 130 description to say "under the `loop:` section", (2) update YAML example to show `concurrency_cap: 3` nested under `loop:`, (3) simplify line 136 since all settings are now consistently under `loop:`. (priority: high)

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
- [x] [spec-gap] **P2: `provider_timeout` compile→load chain is broken** — fixed in `compile-loop-plan.ts` and `loop.sh`; `loop.ps1` gap resolved.
- [x] [spec-gap] **P3: `concurrency_cap` in `LoopSettings` interface is dead code** — removed from `LoopSettings` interface in `compile-loop-plan.ts`.
- [x] [spec-gap] **P3: SPEC.md loop-plan.json format example missing `loopSettings`** — updated SPEC.md example to include `loopSettings` with all fields from the `LoopSettings` interface, plus `finalizer`/`finalizerPosition`. Added note that `loopSettings` is conditionally present.
- [x] [review] Gate 9 + loop.ps1 gap: added `provider_timeout` → `ProviderTimeoutSec` mapping to both `Load-LoopSettings` and `Refresh-LoopSettingsFromMeta` in `loop.ps1`; updated README.md to mark `provider_timeout` as fully implemented and added it to the YAML example.
- [x] [build] Gate 9: `README.md:109,113` — fix inaccurate hot-reload references. Line 109 and 113 now correctly state `loop-plan.json` is read at startup and `meta.json` is hot-reloaded each iteration.

---

spec-gap analysis: no discrepancies found — spec fully fulfilled

All `LoopSettings` fields in `compile-loop-plan.ts` match SPEC.md `loop-plan.json` format example exactly. Default values in `defaults.ts` match SPEC.md example values. `loop.sh` and `loop.ps1` both handle all fields including `provider_timeout` in both startup load and hot-reload. `concurrency_cap` is correctly absent from `loopSettings` (it's orchestrator-only, read separately by `resolveOrchestratorSettingsFromConfig`). All previously-filed `[spec-gap]` items are resolved.
