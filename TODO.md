# Issue #174: Add provider health integration tests for concurrent access and state transitions

## Current Phase: Implementation

### In Progress

- [x] Add state transition integration tests to `loop_provider_health_integration.tests.sh` — test healthy→cooldown→healthy (success after cooldown) and healthy→degraded (auth failure) paths using `update_provider_health_on_success` and `update_provider_health_on_failure` against real health JSON files in a temp dir (AC1)

### Up Next

- [ ] Add backoff escalation test — call `update_provider_health_on_failure` repeatedly (non-auth errors) and verify cooldown_until escalates through all 5 tiers: 0s → 2m → 5m → 15m → 30m → 60m cap. Verify `get_provider_cooldown_seconds` returns correct values for failures 1–7+ (AC2)

- [ ] Add concurrent write safety test — spawn 2+ background subshells that simultaneously call `set_provider_health_state` on the same provider health file, then verify the resulting JSON is valid (not corrupted/truncated). Run multiple rounds to increase confidence (AC3)

- [ ] Add lock failure graceful degradation test — simulate lock contention by pre-creating the lock dir, then call `get_provider_health_state`; verify it returns exit code 1 (not crash), and that the caller can continue operating. Verify warning is logged via `write_log_entry` (AC4)

- [ ] Add TypeScript `readProviderHealth()` tests in `aloop/cli/src/__tests__/provider-health.test.ts` — create temp `~/.aloop/health/` dir with sample health JSON files, call `readProviderHealth(tempHome)`, verify correct parsing. Test edge cases: missing health dir, empty dir, malformed JSON files, mixed valid/invalid files (AC5)

- [ ] Add cross-session health reset test — session A calls `update_provider_health_on_failure` to put a provider in cooldown, then session B (separate process or separate function call with different context) calls `update_provider_health_on_success` on the same provider and verify status resets to healthy with consecutive_failures=0 (AC7)

### Completed

- [x] Status formatting tests verify correct output for all 3 states — already covered in `aloop/cli/src/commands/status.test.ts` with tests for cooldown (failure count + resume time), degraded (auth hint), and healthy (last success) (AC6)
