# Review Log

## Review — 2026-03-27 — commit 630bc9c54..a854aa15c (+ 2 WIP commits)

**Verdict: FAIL** (4 gates failing → 8 [review] tasks written to TODO.md)
**Scope:** `aloop/cli/src/lib/scan-diagnostics.ts`, `aloop/cli/src/lib/scan-diagnostics.test.ts`, `aloop/cli/src/commands/process-requests.ts` (wiring), `aloop/cli/src/commands/orchestrate.ts` (OrchestratorState extension)

### Gate 1 FAIL — Spec deviations in scan-diagnostics.ts (3 issues)

1. **Wrong default threshold** (`scan-diagnostics.ts:22`): `DEFAULT_THRESHOLD = 3` but SPEC-ADDENDUM.md:1047 requires "configurable, default 5". QA bug `[qa/P1]` confirms. All 15 unit tests use threshold=3 and would need updating.

2. **Wrong diagnostics.json schema** (`scan-diagnostics.ts:76-82`): Code writes `{updated_at, blockers[], affected_issues[], suggested_actions[]}` (object). Spec requires an array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` per SPEC-ADDENDUM.md:1053. Dashboard integration will break. QA bug `[qa/P1]` confirms.

3. **Missing `stuck: true` in orchestrator.json** (`runSelfHealingAndDiagnostics`): SPEC-ADDENDUM.md:1049 says "Set a `stuck: true` flag in `orchestrator.json`" on escalation. Not implemented. QA bug `[qa/P2]` confirms.

Completed tasks that ARE spec-compliant: blocker hash tracking, count accumulation, ALERT.md at 2×threshold, stale session cleanup, label auto-creation via adapter.

### Gate 2 FAIL — Shallow test assertions (4 cases)

- `scan-diagnostics.test.ts:87` — `assert.ok(result[0]!.hash.length > 0)` — existence check; should assert exact hash string
- `scan-diagnostics.test.ts:187` — `assert.ok(parsed.suggested_actions.length > 0)` — truthy check; should assert specific action text
- `scan-diagnostics.test.ts:211` — `assert.ok(written[0]!.data.includes('ALERT'))` — substring; should verify exact section header
- `scan-diagnostics.test.ts:213` — `assert.ok(written[0]!.data.includes('7'))` — number could appear anywhere; should assert within proper context

Positive observations: tests DO assert specific counts (`result.length === 1`), specific iteration values, specific types, and specific paths. The shallow checks are isolated to hash format and string content.

### Gate 3 FAIL — Branch coverage gap

`cleanStaleSessions`: the branch where `staleIds.length > 0` but NO issue in `orchState.issues` matches any stale session ID is untested. In this case `changed` remains false and `orchestrator.json` is NOT rewritten (correct behavior, but the branch is invisible to test).

### Gate 4 PASS

No dead code, no commented-out code, no TODO/FIXME. The 15 new tests are focused. `scan-diagnostics.ts` is 157 lines (slightly over 150 target but acceptable). Wiring in `process-requests.ts` is minimal and well-scoped.

### Gate 5 FAIL — Pre-existing test regressions

Issue #147's 15 unit tests all pass. However, the branch has 17 tests that pass on master but fail here. These are regressions from earlier feature merges (not from issue #147's own commit 630bc9c54):
- orchestrate.test.ts: 12 failures (validateDoR, launchChildLoop, checkPrGates, reviewPrDiff, processPrLifecycle, etc.)
- dashboard.test.ts: 4 failures (GH request processor, host monitor)
- EtagCache: 1 failure

Type check: PASS. Build: PASS.

### Gate 6 PASS

Internal plumbing work (new TS module + wiring). No proof-manifest.json exists and none is required per spec — skipping with empty artifacts is the expected correct outcome.

### Gates 7, 8, 9 PASS

No UI changes, no new dependencies (versions unchanged), no user-facing behavior changes requiring doc updates.

---
