# Issue #147: Scan agent self-healing and diagnostics

## Current Phase: Fix spec violations and pre-existing regressions

### In Progress

### Up Next

- [x] [review/Gate2] `scan-diagnostics.test.ts:87` — Rewrite `assert.ok(result[0]!.hash.length > 0)` to assert exact hash value `'child_failed:42:OOM error occurred'` (priority: medium)
- [x] [review/Gate2] `scan-diagnostics.test.ts:212-213` — Rewrite substring checks `suggested_fix.includes('child_failed')` and `suggested_fix.includes('5')` to assert exact value `'Investigate child_failed for issue #5: OOM error occurred'` — the old `suggested_actions` check was replaced but the new assertions are equally shallow (priority: medium)
- [x] [review/Gate2] `scan-diagnostics.test.ts` (`runSelfHealingAndDiagnostics: missing diagnostics_blocker_threshold defaults to 5`) — Rewrite `assert.ok(written['/ses/diagnostics.json'])` to parse and assert content: verify array length, type, severity, and suggested_fix fields — existence-only check doesn't verify output is correct (priority: medium)
- [x] [review/Gate2] `scan-diagnostics.test.ts:237-238` — Rewrite `assert.ok(...includes('ALERT'))` and `includes('7')` to assert specific markdown section header and issue number in proper context (priority: medium)
- [x] [review/Gate3] `scan-diagnostics.ts:cleanStaleSessions` — Add test for the branch where `staleIds.length > 0` but no issue in `orchState.issues` has a matching `child_session` — `changed` stays false and `orchestrator.json` is NOT rewritten (priority: medium) [reviewed: gates 1-9 pass]
- [ ] Add dashboard integration to read and display `diagnostics.json` (priority: medium)
- [ ] Add `no_progress` escalation: pause loop after N consecutive no-progress scans (write `state: paused` to status.json per SPEC-ADDENDUM.md:1050) (priority: low)

### Completed

- [x] [review/Gate1] `scan-diagnostics.ts:22` — Change `DEFAULT_THRESHOLD` from 3 to 5 (SPEC-ADDENDUM.md:1047 specifies "configurable, default 5"), and update the test at scan-diagnostics.test.ts:371 which hardcodes "defaults to 3" (priority: high)
- [x] [review/Gate1] `scan-diagnostics.ts:76-82` — Rewrite `writeDiagnosticsJson` to produce spec-compliant schema: write an array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` objects instead of `{updated_at, blockers[], affected_issues[], suggested_actions[]}`. Update all dependent tests (priority: high)
- [x] Wire `runSelfHealingAndDiagnostics` into `process-requests.ts` (blocker tracking, diagnostics.json, ALERT.md, self-healing, stale session cleanup)
- [x] Add blocker record persistence (`blockers.json` load/save between iterations)
- [x] Create adapter for label auto-creation when repo is available
- [x] [review/Gate1] `runSelfHealingAndDiagnostics` — Add `stuck: true` write to `orchestrator.json` when any blocker record's count >= threshold (SPEC-ADDENDUM.md:1049 requires it). Add a test covering this path (priority: high) — QA CONFIRMED PASS at 82432eb7a
- [x] [qa/P1] ALERT.md written at 2×threshold (count=10) instead of threshold (count=5): `writeAlertMd` uses `r.count >= threshold * 2` as the trigger condition in scan-diagnostics.ts:99, but spec (SPEC-ADDENDUM.md:1047–1064) escalation fires at N=threshold=5. Fix: change trigger to `r.count >= threshold`. Update `writeAlertMd` test accordingly. Tested at commit ea766e506. (priority: high) — QA CONFIRMED PASS at 82432eb7a
- [x] [qa/P1] `lastSeenIteration` never updates: blockers.json `lastSeenIteration` stays at initial value (1) across all subsequent iterations — `current_iteration` in diagnostics.json is always wrong. Root cause: `passResult.iteration` reads from `loop-plan.json.iteration`; in loop.sh operation this is written before process-requests is called (persist_loop_plan_state at loop.sh:2195), but in standalone invocation `loop-plan.json` is never incremented. Fix: process-requests should write back an incremented `loop-plan.json.iteration` after each run so standalone invocations work correctly. Spec requires `current_iteration` = most recent iteration where blocker was seen. Tested at commit ea766e506. (priority: high) — QA CONFIRMED PASS at aca3bd052
- [x] [qa/P2] `blockers.json` initialized as `{}` (empty object) causes fatal: TypeError: existingRecords.map is not a function. Repro: create blockers.json containing `{}` then run process-requests. Fix: after `JSON.parse`, validate result is an array; fall back to `[]` if not. (priority: medium) — QA CONFIRMED PASS at e67019313
- [x] [review/Gate5] Fix pre-existing test regressions before merging: orchestrate.test.ts (11 failures), dashboard.test.ts (5 failures), EtagCache (1 failure) — 17 top-level failures total (priority: high)
- [x] [review/Gate5] `dashboard.test.ts:34` — `makeDefaultRequestSpawnSync` return type annotation causes TypeScript error: function body returns `SpawnSyncReturns<string | NonSharedBuffer>` but `typeof spawnSync` demands `SpawnSyncReturns<NonSharedBuffer>`. Fix: cast the return to `as ReturnType<typeof spawnSync>` or use `as unknown as typeof spawnSync` on the function, or annotate inner returns explicitly as `Buffer` (priority: high)
- [x] [review/Gate4] `scan-diagnostics.ts:72` — Remove unused `now: () => Date` parameter from `writeDiagnosticsJson` and its callsites in `scan-diagnostics.ts` and `scan-diagnostics.test.ts` — left over from old schema that used `now().toISOString()` for `updated_at`; new schema has no timestamp (priority: medium)
