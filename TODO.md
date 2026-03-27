# Issue #147: Scan agent self-healing and diagnostics

## Current Phase: Fix spec violations and pre-existing regressions

### In Progress

### Up Next

- [ ] [review/Gate5] Fix pre-existing test regressions before merging: orchestrate.test.ts (12 failures including `orchestrateCommandWithDeps with --plan`, `validateDoR`, `launchChildLoop`, `checkPrGates`, `reviewPrDiff`, `processPrLifecycle`, `queueGapAnalysisForIssues`, `runOrchestratorScanPass`, `monitorChildSessions`), dashboard.test.ts (4 failures: `host monitor processes GH convention requests outside loop runtime`, `GH request processor writes error response for unsupported request type`, and 2 others), EtagCache (priority: high)
- [x] [review/Gate1] `scan-diagnostics.ts:22` — Change `DEFAULT_THRESHOLD` from 3 to 5 (SPEC-ADDENDUM.md:1047 specifies "configurable, default 5"), and update the test at scan-diagnostics.test.ts:371 which hardcodes "defaults to 3" (priority: high)
- [ ] [review/Gate1] `scan-diagnostics.ts:76-82` — Rewrite `writeDiagnosticsJson` to produce spec-compliant schema: write an array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` objects instead of `{updated_at, blockers[], affected_issues[], suggested_actions[]}`. Update all dependent tests (priority: high)
- [ ] [review/Gate1] `runSelfHealingAndDiagnostics` — Add `stuck: true` write to `orchestrator.json` when any blocker record's count >= threshold (SPEC-ADDENDUM.md:1049 requires it). Add a test covering this path (priority: high)
- [ ] [review/Gate2] `scan-diagnostics.test.ts:87` — Rewrite `assert.ok(result[0]!.hash.length > 0)` to assert exact hash value `'child_failed:42:OOM error occurred'` (priority: medium)
- [ ] [review/Gate2] `scan-diagnostics.test.ts:187` — Rewrite `assert.ok(parsed.suggested_actions.length > 0)` to assert specific action text containing the blocker type and issue number (priority: medium)
- [ ] [review/Gate2] `scan-diagnostics.test.ts:211-213` — Rewrite `assert.ok(...includes('ALERT'))` and `includes('7')` to assert specific markdown section header and issue number in proper context (priority: medium)
- [ ] [review/Gate3] `scan-diagnostics.ts:cleanStaleSessions` — Add test for the branch where `staleIds.length > 0` but no issue in `orchState.issues` has a matching `child_session` — `changed` stays false and `orchestrator.json` is NOT rewritten (priority: medium)
- [ ] Add dashboard integration to read and display `diagnostics.json` (priority: medium)
- [ ] Add `no_progress` escalation: pause loop after N consecutive no-progress scans (write `state: paused` to status.json per SPEC-ADDENDUM.md:1050) (priority: low)

### Completed

- [x] Wire `runSelfHealingAndDiagnostics` into `process-requests.ts` (blocker tracking, diagnostics.json, ALERT.md, self-healing, stale session cleanup)
- [x] Add blocker record persistence (`blockers.json` load/save between iterations)
- [x] Create adapter for label auto-creation when repo is available
