# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

- [x] Implement as described in the issue

### In Progress / Up Next

- [x] [review/Gate4] Remove dead orchestrator-level variables from `loop.sh` and `loop.ps1` — `TRIAGE_INTERVAL`, `SCAN_PASS_THROTTLE_MS`, `CONCURRENCY_CAP`, `RATE_LIMIT_BACKOFF`, `COST_PER_ITERATION_USD`, `BUDGET_APPROACHING_THRESHOLD` are initialized and loaded in both files but **never referenced in any actual loop logic** (only in their own declarations and inside the Load/Refresh settings functions). Remove from: `loop.sh` lines ~310-315,323,348-354,386-391,399 and `loop.ps1` lines ~114-120 and the corresponding `if ($null -ne ...)` blocks in `Load-LoopSettings` (lines ~141-148) and `Refresh-LoopSettingsFromMeta` (lines ~180-187). Architecture rule: orchestrator-level settings belong only in `orchestrate.ts`. (priority: high)

- [x] [review/Gate3a] Add 18 missing fields to `compile-loop-plan.test.ts:847` — The test at line 847 only asserts 10 fields from the pipeline.yml loop section. The following 18 newer fields have zero test coverage: `retry_backoff_linear_step_secs`, `retry_backoff_exponential_base`, `phase_retries_min`, `cost_per_iteration_usd`, `budget_approaching_threshold`, `qa_coverage_gate_max_untested_pct`, `git_fetch_timeout_ms`, `git_merge_base_timeout_ms`, `gh_cli_timeout_ms`, `gh_watch_interval_secs`, `gh_watch_max_concurrent`, `gh_feedback_max_iterations`, `gh_ci_failure_persistence_limit`, `gh_etag_cache_ttl_ms`, `priority_critical`, `priority_high`, `priority_low`, and the existing `concurrency_cap` (already in fixture but not all 18 verified). Add each field to the pipeline.yml fixture in that test and add exact `assert.equal(loopPlanJson.loopSettings.<field>, <value>)` assertions. (priority: high)

- [x] [review/Gate4b] Remove `QA_COVERAGE_GATE_MAX_UNTESTED_PCT` dead code from `loop.sh` — The variable is initialized at line 339 and loaded in both `load_loop_settings` (line 310) and `refresh_loop_settings_from_meta` (line 371), but `$QA_COVERAGE_GATE_MAX_UNTESTED_PCT` is never referenced in any actual loop logic in loop.sh. The equivalent `$script:QaCoverageGateMaxUntestedPct` IS used in loop.ps1 at line 1001. Either implement the QA coverage gate logic in loop.sh (matching loop.ps1:999-1003) or remove the variable from loop.sh entirely. (priority: medium)

- [x] [review/Gate3b] Create `aloop/cli/src/lib/loop-settings.test.ts` — `loop-settings.ts` is a 180-line module with zero test coverage. Cover: (1) `loadLoopSettings` with valid loop-plan.json asserting all fields match exact values; (2) missing/unreadable file falls back to `DEFAULT_LOOP_SETTINGS` for all fields; (3) `readNumberArray` inline-array-string parsing (e.g. `"[0,120,300]"`); (4) `readStringEnum` rejects invalid value and uses fallback; (5) `loadLoopSettings` returns a frozen object. (priority: high)

- [ ] [qa/P1] Fix hot-reload: `aloop start` must write `loop_settings` to meta.json — In `start.ts`, after `compileLoopPlan()` writes loop-plan.json to `sessionDir` (line ~881), call `loadLoopSettings(path.join(sessionDir, 'loop-plan.json'))` and add the result as `loop_settings` to the `meta` object (line ~983) before writing meta.json. Also add `loop_settings?: ReadonlyLoopSettings` (or a compatible type) to the `SessionMeta` interface (line 441). Add a test in `start.test.ts` that verifies meta.json contains `loop_settings` with the correct pipeline.yml values. (priority: high)

### Completed
- [x] Implement as described in the issue (extracted hardcoded values to pipeline.yml and DEFAULT_LOOP_SETTINGS, implemented loop-settings.ts, compile-loop-plan updated to include loopSettings, loop.sh/loop.ps1 load settings from loop-plan.json)