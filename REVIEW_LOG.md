# Review Log

## Review — 2026-03-30 — commits 8c4cb48..f3350fe (issue #94 build iterations)

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/compile-loop-plan.ts`, `aloop/cli/src/commands/compile-loop-plan.test.ts`, `aloop/cli/src/lib/defaults.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `.aloop/pipeline.yml`, `aloop/config.yml`

### What the build implemented
- `DEFAULT_LOOP_SETTINGS` as single source of truth in `defaults.ts`
- `pipeline.yml` `loop:` section with `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `concurrency_cap`, `max_iterations`, and all other loop settings
- `compile-loop-plan.ts`: `readLoopSettingsFromPipeline()` reads loop settings from pipeline.yml and embeds them in `loop-plan.json` as `loopSettings`
- `loop.sh`/`loop.ps1`: `load_loop_settings()` at startup and `refresh_loop_settings_from_meta()` each iteration — all configurable vars
- `orchestrate.ts`: `resolveOrchestratorSettingsFromConfig()` reads `concurrency_cap`, `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` from pipeline.yml at startup, CLI takes precedence
- Scan loop hot-reloads `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` from `state.json` each pass
- Rate limit backoff strategies: exponential, linear, fixed implemented with logging
- `max_iterations` for child loops uses `state.max_iterations` (formerly hardcoded 999999)

### Findings

- **Gate 2+3**: `compile-loop-plan.test.ts:847` — The `loopSettings` roundtrip test verifies `max_iterations`, `inter_iteration_sleep`, `cooldown_ladder`, `request_timeout`, `concurrent_cap_cooldown` but does NOT test any of the new issue-94 fields: `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`. All three are in `readLoopSettingsFromPipeline`'s `numFields` / special handling but have zero compile-loop-plan test coverage. → written as `[review]` task.

- **Gate 4**: `loop.sh:306-307,315,338-340,368-369,377` — `TRIAGE_INTERVAL`, `SCAN_PASS_THROTTLE_MS`, `RATE_LIMIT_BACKOFF` are set to defaults and loaded from loop-plan.json/meta.json but **never referenced** in any actual loop logic. These are orchestrator-level concepts (used only in `orchestrate.ts`), not inner-loop concerns. Loading them is dead code. → written as `[review]` task.

- **Gate 2**: `orchestrate.ts:5856-5876` — The backoff strategy switch (exponential/linear/fixed) produces different sleep values but no unit test covers these three branches. The `resolveOrchestratorSettingsFromConfig` tests are thorough, but the downstream backoff arithmetic itself is untested. → written as `[review]` task.

### Gates that passed

- **Gate 1**: Spec compliance — all required config fields are present and hot-reloadable. `resolveOrchestratorSettingsFromConfig` correctly reads all four settings from pipeline.yml with CLI override precedence. Hardcoded 999999 is gone.
- **Gate 2 (partial)**: `resolveOrchestratorSettingsFromConfig` at `orchestrate.test.ts:4621` has 6 well-written tests with exact value assertions (not just toBeDefined), covering defaults, pipeline.yml override, CLI override, partial merge, no loop section, and EACCES.
- **Gate 5**: All 33 test failures are pre-existing (identical count on master branch). Type-check passes. Server build succeeds.
- **Gate 6**: Work is purely internal plumbing — no proof artifacts expected or needed.
- **Gate 7**: N/A — no UI/CSS changes.
- **Gate 8**: No dependency version changes.
- **Gate 9**: README unchanged; no user-facing behavior change requiring documentation.

---
