# Issue #154: Extract session and sidebar components from AppView.tsx
# Issue #174: Add provider health integration tests

## Current Phase: Implementation

### In Progress

- [x] [review] Gate 1: Extract `Sidebar` to `src/components/layout/Sidebar.tsx` and create `SessionDetail.tsx` per TASK_SPEC — extracted Sidebar and created SessionDetail component

### Up Next

- [ ] [review] Gate 1: Fix branch data pipeline — `SessionCard.tsx:44-45` renders `session.branch` but the server-side session data mapper (`/api/state` endpoint) does not populate `SessionSummary.branch` from `meta.json`. Fix the data mapper to include branch. This also resolves QA bug "session card missing branch name". (priority: high)

- [ ] [review] Gate 3: Add unit tests for `SessionCard.tsx`, `SessionList.tsx`, `helpers.tsx` — no dedicated tests exist, only indirect coverage through `App.coverage.test.ts`. Add tests for: empty branch/phase/iterations in SessionCard, empty sessions list in SessionList, all StatusDot status variants, PhaseBadge with unknown phase, relativeTime with invalid date string. Target >=90% branch coverage. (priority: high)

- [ ] [qa/P1] Session grouping labels don't match spec exactly: `SessionList.tsx` groups active sessions by project name (collapsible) and older sessions under "Older" (collapsible, collapsed by default). Spec (SPEC.md:1085) requires "Active" and "Older (N)" labels. Active group header should say "Active", not project name. The "Older" header should include session count as "Older (N)". (priority: medium)

- [ ] Add backoff escalation test — call `update_provider_health_on_failure` repeatedly (non-auth errors) and verify cooldown_until escalates through all 6 tiers: 0s → 2m → 5m → 15m → 30m → 60m cap. Verify `get_provider_cooldown_seconds` returns correct values for failures 1–7+ (AC2)

- [ ] Add concurrent write safety test — spawn 2+ background subshells that simultaneously call `set_provider_health_state` on the same provider health file, then verify the resulting JSON is valid (not corrupted/truncated). Run multiple rounds to increase confidence (AC3)

- [ ] Add lock failure graceful degradation test — simulate lock contention by pre-creating the lock dir, then call `get_provider_health_state`; verify it returns exit code 1 (not crash), and that the caller can continue operating. Verify warning is logged via `write_log_entry` (AC4)

- [ ] Add cross-session health reset test — session A calls `update_provider_health_on_failure` to put a provider in cooldown, then session B (separate process or separate function call with different context) calls `update_provider_health_on_success` on the same provider and verify status resets to healthy with consecutive_failures=0 (AC7)

### Deferred

- [~] Add TypeScript `readProviderHealth()` tests in dedicated file (AC5) — PARTIALLY COVERED: `session.test.ts:60-80` already tests missing health dir (returns `{}`) and malformed/non-JSON files (ignores them, parses valid ones). Remaining gap: empty dir test. Low priority since core paths are covered.

### Completed

- [x] Add state transition integration tests to `loop_provider_health_integration.tests.sh` — tests healthy→cooldown→healthy and healthy→degraded paths with real health JSON files (AC1)
- [x] Status formatting tests verify correct output for all 3 states — covered in `status.test.ts` with tests for cooldown, degraded, and healthy (AC6)
- [x] Extract `SessionCard.tsx` — exists at `src/components/session/SessionCard.tsx` with status dot, elapsed time, iteration count, phase badge, and branch rendering
- [x] Extract `SessionList.tsx` — exists at `src/components/session/SessionList.tsx` with Active/Older collapsible groups and project-based grouping
- [x] [qa/P1] Force stop (SIGKILL) button — EXISTS: dropdown menu item at `AppView.tsx:1588-1591` ("Kill immediately" with SIGKILL label) plus command palette entry at line 1627. QA finding was stale.
