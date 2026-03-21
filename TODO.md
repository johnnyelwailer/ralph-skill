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

### Review Findings (2026-03-21, review of bfcd883..12ddb5e)

- [ ] [review] Gate 1: TASK_SPEC requires `SessionDetail.tsx` and `layout/Sidebar.tsx` — neither was created. The `Sidebar` function remains inline in `AppView.tsx:579-633`. Extract it to `src/components/layout/Sidebar.tsx` and create `SessionDetail.tsx` per spec. (priority: high)
- [ ] [review] Gate 3: New modules `SessionCard.tsx`, `SessionList.tsx`, `helpers.tsx` have no dedicated unit tests — they are only exercised indirectly through `App.coverage.test.ts:629` Sidebar test. New modules require >=90% branch coverage. Add tests for: empty branch/phase/iterations in SessionCard, empty sessions list in SessionList, all StatusDot status variants, PhaseBadge with unknown phase, relativeTime with invalid date string. (priority: high)
- [ ] [review] Gate 1: SessionCard component correctly renders branch name (`SessionCard.tsx:44-45`) but QA confirms branch is empty at runtime — the data pipeline populating `SessionSummary.branch` (via `/api/state` endpoint) is not including `meta.json` branch data. Fix the server-side session data mapper to include the branch field. (priority: high)

### QA Bugs (from dashboard component extraction testing, 2026-03-21)

- [ ] [qa/P1] Session card missing branch name: Session cards in sidebar show session name, status dot, elapsed time, iteration count, and phase — but NOT the branch name. Spec (SPEC.md:1092) requires "branch name" as a session card field. Tested at iter 16. (priority: high)
- [ ] [qa/P1] Session grouping labels don't match spec: Sidebar groups sessions under "RECENT" label, but spec (SPEC.md:1085) requires "Active" and "Older (N)" collapsible groups. The "Older" group should auto-collapse sessions with no activity >24h. Tested at iter 16. (priority: high)
- [ ] [qa/P1] Force stop (SIGKILL) button missing: Footer only has a "Stop" button. Spec (SPEC.md:1197-1198) requires both "Stop (SIGTERM)" and "Force (SIGKILL)" buttons. No dropdown or separate Force button exists. Tested at iter 16. (priority: high)
