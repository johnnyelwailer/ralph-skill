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

## Review — 2026-03-27 — commit 565d7a0c6..5bcc23f0a

**Verdict: FAIL** (5 gates failing → 3 new/updated [review] tasks written to TODO.md; prior open tasks still unresolved)
**Scope:** `aloop/cli/src/lib/scan-diagnostics.ts`, `aloop/cli/src/lib/scan-diagnostics.test.ts`

### What the last build iteration fixed (PASS)

Both completed Gate 1 items are correct and spec-compliant:
- `DEFAULT_THRESHOLD = 5` (`scan-diagnostics.ts:22`) — matches SPEC-ADDENDUM.md:1047 ✓
- `writeDiagnosticsJson` rewritten to array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` (`scan-diagnostics.ts:76-90`) — matches SPEC-ADDENDUM.md:1053 ✓
- `severity` logic: 'warning' at threshold, 'critical' at threshold×2 — consistent with spec's distinction between "diagnostic" and "critical blocker" ✓

### Gate 1 FAIL — stuck: true still not implemented (carried)

`runSelfHealingAndDiagnostics` still does not write `stuck: true` to `orchestrator.json` on escalation. SPEC-ADDENDUM.md:1049 is unambiguous. This was the third Gate 1 open item from the prior review and was not addressed in this iteration.

### Gate 2 FAIL — 4 shallow assertions (2 new, 2 carried)

- `scan-diagnostics.test.ts:86` — `assert.ok(result[0]!.hash.length > 0)` existence check; assert exact hash `'child_failed:42:OOM error occurred'` (carried, not fixed)
- `scan-diagnostics.test.ts:192-193` — NEW: `suggested_fix.includes('child_failed')` / `includes('5')` substring checks introduced by the schema rewrite; should assert exact `'Investigate child_failed for issue #5: OOM error occurred'`
- `scan-diagnostics.test.ts:217-218` — `data.includes('ALERT')` and `data.includes('7')` substring checks (carried, not fixed)
- `scan-diagnostics.test.ts:396` — NEW: `assert.ok(written['/ses/diagnostics.json'])` existence-only check on the default-threshold test; should parse and assert content

### Gate 3 FAIL — cleanStaleSessions branch coverage (carried)

Branch where `staleIds.length > 0` but no issue matches: still untested. `changed` stays false, `orchestrator.json` not rewritten. Not addressed by this iteration.

### Gate 4 FAIL — dead parameter in writeDiagnosticsJson (NEW)

`scan-diagnostics.ts:72` — `now: () => Date` parameter accepted but never used inside the function. Was used by the old schema (`updated_at: now().toISOString()`); not removed when schema was rewritten. All callsites still pass `deps.now` / `() => new Date(...)` unnecessarily.

### Gate 5 FAIL — pre-existing regressions (carried)

17 tests still failing: orchestrate.test.ts (12), dashboard.test.ts (4), EtagCache (1). Not related to this iteration's changes and not addressed.

### Gates 6, 7, 8, 9 PASS

Internal plumbing, no proof required; no UI changes; no version changes; no doc-impacting behavior.

---
