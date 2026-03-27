# Issue #147: Scan agent self-healing and diagnostics

## Tasks

- [x] Wire `runSelfHealingAndDiagnostics` into `process-requests.ts` (blocker tracking, diagnostics.json, ALERT.md, self-healing, stale session cleanup)
- [x] Add blocker record persistence (`blockers.json` load/save between iterations)
- [x] Create adapter for label auto-creation when repo is available
- [ ] Add dashboard integration to read and display `diagnostics.json`
- [ ] Add `no_progress` escalation (pause loop after N consecutive no-progress scans)

## Review Findings (from review 2026-03-27)

- [ ] [review] Gate 1: `scan-diagnostics.ts:22` — `DEFAULT_THRESHOLD = 3` but SPEC-ADDENDUM.md:1047 says "configurable, default 5" — change constant to 5 and update all dependent tests (priority: high)
- [ ] [review] Gate 1: `scan-diagnostics.ts:76-82` — `diagnostics.json` schema is `{updated_at, blockers[], affected_issues[], suggested_actions[]}` but spec requires an array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` — rewrite `writeDiagnosticsJson` to produce the spec-compliant schema and update tests (priority: high)
- [ ] [review] Gate 1: `runSelfHealingAndDiagnostics` never sets `stuck: true` in `orchestrator.json` on escalation — SPEC-ADDENDUM.md:1049 requires it when threshold is exceeded — add this write and cover it with a test (priority: high)
- [ ] [review] Gate 2: `scan-diagnostics.test.ts:87` — `assert.ok(result[0]!.hash.length > 0)` is an existence check — rewrite to assert exact hash value `'child_failed:42:OOM error occurred'` (priority: medium)
- [ ] [review] Gate 2: `scan-diagnostics.test.ts:187` — `assert.ok(parsed.suggested_actions.length > 0)` is a truthy check — rewrite to assert specific action text containing the blocker type and issue number (priority: medium)
- [ ] [review] Gate 2: `scan-diagnostics.test.ts:211-213` — `assert.ok(...includes('ALERT'))` and `includes('7')` are substring checks — rewrite to assert the specific markdown section header and issue number in proper context (priority: medium)
- [ ] [review] Gate 3: `scan-diagnostics.ts:cleanStaleSessions` — uncovered branch: `staleIds.length > 0` but no issue in `orchState.issues` has matching `child_session` — `changed` remains false and `orchestrator.json` is NOT rewritten — add test for this case (priority: medium)
- [ ] [review] Gate 5: 17 tests pass on master but fail on this branch (pre-existing regressions from earlier feature merges) — investigate and fix before merging: orchestrate.test.ts (12 failures including `orchestrateCommandWithDeps with --plan`, `validateDoR`, `launchChildLoop`, `checkPrGates`, `reviewPrDiff`, `processPrLifecycle`, `queueGapAnalysisForIssues`, `runOrchestratorScanPass`, `monitorChildSessions`), dashboard.test.ts (4 failures: `host monitor processes GH convention requests outside loop runtime`, `GH request processor writes error response for unsupported request type`, and 2 others), EtagCache (priority: high)

## QA Bugs

- [ ] [qa/P1] diagnostics.json wrong escalation threshold: `diagnostics.json` written at count=3, spec says default N=5 — tested at QA session 2026-03-27 (priority: high)
- [ ] [qa/P1] diagnostics.json schema mismatch: actual is `{updated_at, blockers[], affected_issues[], suggested_actions[]}` not array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` as spec requires — dashboard integration will break without schema alignment. Tested at QA session 2026-03-27 (priority: high)
- [ ] [qa/P2] orchestrator.json missing `stuck: true` flag: spec says set `stuck: true` in `orchestrator.json` on escalation — not written. Tested at QA session 2026-03-27 (priority: medium)
- [ ] [qa/P2] process-requests silent exit on non-existent session dir: exits 0 with no output when `--session-dir` does not exist — should warn user. Tested at QA session 2026-03-27 (priority: medium)
- [ ] [qa/P2] --output json omits diagnostics: blocker/diagnostics info not included in JSON output, making it impossible for callers to detect blocker escalation programmatically. Tested at QA session 2026-03-27 (priority: medium)
