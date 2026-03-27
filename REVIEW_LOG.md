# Review Log

## Review — 2026-03-27 — commit fd0186e95..e8cf657e0

**Verdict: PASS** (all prior findings resolved; gates 1-9 pass)
**Scope:** `aloop/cli/src/lib/scan-diagnostics.test.ts` (assertion strengthening + new coverage test)

### Prior findings resolved

All 5 open items from the last FAIL review (fd0186e95) are confirmed fixed:

- **Gate 2 (4 items):**
  - `scan-diagnostics.test.ts:86`: `assert.ok(result[0]!.hash.length > 0)` → `assert.equal(result[0]!.hash, 'child_failed:42:OOM error occurred')` — exact value, matches `hashBlocker` output ✓
  - `scan-diagnostics.test.ts:212`: `.includes('child_failed')` / `.includes('5')` → `assert.equal(parsed[0]!.suggested_fix, 'Investigate child_failed for issue #5: OOM error occurred')` — exact value, matches `writeDiagnosticsJson` template ✓
  - `scan-diagnostics.test.ts:236-237`: `.includes('ALERT')` / `.includes('7')` → `.includes('# ALERT: Persistent Blockers Detected')` / `.includes('## child_failed (issue 7)')` — specific section headers matching `writeAlertMd` output exactly ✓
  - `scan-diagnostics.test.ts:459-464`: existence-only → adds `diag.length === 1`, `type === 'child_failed'`, `severity === 'warning'`, `suggested_fix === 'Investigate child_failed for issue #1: err'` — all concrete values ✓

- **Gate 3:** New test `runSelfHealingAndDiagnostics: stale session with no matching child_session does not rewrite orchestrator.json` (lines 292-334): verifies `active.json` is cleaned (stale entry removed) but `orchestrator.json` is NOT written when no issue's `child_session` matches any stale ID. Correctly exercises the `changed = false` path in `cleanStaleSessions`. ✓

### Gate 1 — PASS

No production code changed. All prior spec-compliance work (threshold=5, array schema, stuck:true, ALERT.md at N=threshold, stale session cleanup) remains in place and correct per SPEC-ADDENDUM.md §1041-1064.

### Gate 2 — PASS

All 4 prior shallow assertions replaced with exact/specific values. New test at line 459 also uses concrete assertions. No new shallow patterns introduced. A broken `hashBlocker`, `writeDiagnosticsJson`, or `writeAlertMd` implementation would actually fail these tests.

### Gate 3 — PASS

`cleanStaleSessions` no-match branch now covered. The test setup (two issues with mismatched `child_session` values) correctly isolates the branch where `staleIds.length > 0` but `changed` stays false.

### Gates 4, 5, 6, 7, 8, 9 — PASS

- Gate 4: No dead code. Test helper `makeState` / `makePassResult` are existing fixtures — no new dead code.
- Gate 5: 1155 tests, 1154 pass, 0 fail (1 skip is a pre-existing copilot provider skip unrelated to this change). `tsc --noEmit` clean.
- Gate 6: Internal test-only changes. No proof artifacts needed; skipping with empty artifacts is correct.
- Gate 7: No UI changes.
- Gate 8: No dependency changes.
- Gate 9: No user-facing behavior changes.

---

## Review — 2026-03-27 — commit 717c9799b..0ae809cbd

**Verdict: FAIL** (1 new finding; Gates 2, 3, 4 still open from prior iterations)
**Scope:** `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/lib/scan-diagnostics.ts`, `aloop/cli/src/lib/scan-diagnostics.test.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/lib/github-monitor.ts`

### What this iteration fixed (PASS)

**Gate 1 — PASS**

- `blockers.json` non-array guard added in `process-requests.ts:1037-1040`: `Array.isArray(parsed)` check before assigning `blockerRecords`. Correctly handles `{}` init without TypeError. QA CONFIRMED at e67019313.
- `scan-diagnostics.ts:47-48`: parallel `Array.isArray(existingRecords)` guard in `trackBlockers` — defense-in-depth, consistent. Correct.
- `loop-plan.json` post-increment in `process-requests.ts:1065-1073`: standalone invocations now correctly advance the iteration counter after each scan pass. Loop.sh mode is safe: `persist_loop_plan_state` uses independent bash `$ITERATION` variable and overwrites with the same incremented value — no double-increment. QA CONFIRMED at aca3bd052.

**Gate 5 partial — Pre-existing regressions resolved**

- 17 test regressions fixed: `orchestrate.test.ts` (mocks updated to match production reality: `statusCheckRollup` API, `TASK_SPEC.md` filename, `needs_redispatch` pattern, `invokeAgentReview` required for merge, `reviewPrDiff` flag-for-human when no reviewer), `dashboard.test.ts` (5 failures: `makeDefaultRequestSpawnSync` fixture, updated error message regex, packaged assets test), `github-monitor.ts` (EtagCache filename `github-etag-cache.json`). All test changes verified against production code — no assertions weakened.
- New test count: 358 orchestrate, 57 dashboard — all pass.

### Gate 5 FAIL — NEW TypeScript error in dashboard.test.ts (priority: high)

`dashboard.test.ts:34` — `makeDefaultRequestSpawnSync` function declared with return type `typeof spawnSync`, but its inner return (`spawnSync(cmd, args as string[], opts as ...)`) resolves to `SpawnSyncReturns<string | NonSharedBuffer>` while `typeof spawnSync` requires `SpawnSyncReturns<NonSharedBuffer>`. Type check was clean at 717c9799b (old dashboard.test.ts passes `tsc --noEmit`); new code fails with TS2322. Written to TODO.md as `[review/Gate5]`.

### Gates 2, 3, 4 FAIL (all carried, none fixed in this iteration)

- **Gate 2** — 4 shallow assertions unchanged: `scan-diagnostics.test.ts:86` (`hash.length > 0`), `scan-diagnostics.test.ts:212-213` (`includes('child_failed')` / `includes('5')`), `scan-diagnostics.test.ts:237-238` (`includes('ALERT')` / `includes('7')`), `scan-diagnostics.test.ts:416` (existence check on diagnostics.json)
- **Gate 3** — `cleanStaleSessions` no-match branch still untested
- **Gate 4** — `scan-diagnostics.ts:72` dead `now: () => Date` parameter still present

### Gates 6, 7, 8, 9, 10 PASS

Internal plumbing; no proof required; no UI changes; no version changes; QA coverage 13 rows, P1 bugs all resolved, P2 bugs (non-existent dir, JSON output) remain open but are below P1 threshold.

---

## Review — 2026-03-27 — commit 11aa51bb0..d948d2ece

**Verdict: FAIL** (4 gates failing — Gate 1 now PASS; Gates 2, 3, 4, 5 still open)
**Scope:** `aloop/cli/src/lib/scan-diagnostics.ts`, `aloop/cli/src/lib/scan-diagnostics.test.ts`, `aloop/cli/src/commands/orchestrate.ts`

### What this iteration fixed (PASS)

**Gate 1 — PASS (fully resolved)**

- `writeAlertMd` trigger changed from `r.count >= threshold * 2` to `r.count >= threshold` (`scan-diagnostics.ts:99`) — matches spec escalation at N=threshold. QA PASS at 82432eb7a.
- `runSelfHealingAndDiagnostics` now writes `stuck: true` to `orchestrator.json` when any blocker reaches threshold (`scan-diagnostics.ts:163-174`). Implementation is correct: reads current state from disk (picks up cleanStaleSessions changes), is idempotent via `if (!orchState.stuck)` guard, updates `updated_at`. QA PASS at 82432eb7a.
- `OrchestratorState` interface extended with `stuck?: boolean` (`orchestrate.ts:123`). Correct.
- Two new unit tests cover stuck:true write (count=5 >= threshold=5) and non-write (count=4 < threshold=5). Both pass. Assertions are concrete (`assert.equal(saved.stuck, true)`).

### Gate 2 FAIL — 4 shallow assertions (all carried, none fixed)

- `scan-diagnostics.test.ts:87` — `assert.ok(result[0]!.hash.length > 0)`: assert exact hash `'child_failed:42:OOM error occurred'`
- `scan-diagnostics.test.ts:192-193` — `suggested_fix.includes('child_failed')` / `includes('5')`: assert exact `'Investigate child_failed for issue #5: OOM error occurred'`
- `scan-diagnostics.test.ts:217-218` — `data.includes('ALERT')` / `data.includes('7')`: assert specific markdown section header and issue in context
- `scan-diagnostics.test.ts:396` — `assert.ok(written['/ses/diagnostics.json'])`: parse and assert content (array length, type, severity, suggested_fix)

### Gate 3 FAIL — coverage gap (carried)

`cleanStaleSessions`: branch where `staleIds.length > 0` but no `orchState.issues` entry has a matching `child_session` — `changed` stays false, `orchestrator.json` not rewritten. Still untested.

### Gate 4 FAIL — dead parameter (carried)

`scan-diagnostics.ts:71` — `now: () => Date` parameter in `writeDiagnosticsJson` signature. Never called inside the function (old schema used `now().toISOString()` for `updated_at`; new schema removed that field). All callsites still pass `deps.now` unnecessarily.

### Gate 5 FAIL — pre-existing regressions (carried)

32 total test failures, all pre-existing and unrelated to this iteration's changes:
- dashboard.test.ts: 5 failures (host monitor GH convention, unsupported request type, non-zero exit, archive collision, loop.sh runtime path)
- orchestrate.test.ts: 12 failures (validateDoR, launchChildLoop, checkPrGates, reviewPrDiff, processPrLifecycle, etc.)
- EtagCache: 1 failure

Build: PASS. Type check: PASS (tsc not directly runnable but tsx --test succeeds).

### Gates 6, 7, 8, 9 PASS

Internal plumbing only; no proof manifest required; no UI changes; no version changes; no doc-impacting behavior.

---

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

## Review — 2026-03-27 — commit f0f56a228..70c4571f0

**Verdict: FAIL** (0 new findings; Gates 2 and 3 carried from prior iterations)
**Scope:** `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/lib/scan-diagnostics.ts`, `aloop/cli/src/lib/scan-diagnostics.test.ts`

### What the last build iterations fixed (PASS)

- **Gate 4 (9c25d0537 then 7bb514de3):** Dead `now: () => Date` param removed from `writeDiagnosticsJson` — function signature, test callsites at lines 202 and 222 all updated. `SelfHealingDeps.now` is legitimately retained (used in `cleanStaleSessions:136` and `runSelfHealingAndDiagnostics:171`).
- **Gate 5 (9c25d0537):** `makeDefaultRequestSpawnSync` in `dashboard.test.ts:34` now wraps the function body in parentheses and applies `as unknown as typeof spawnSync` cast. Resolves the `SpawnSyncReturns<string | NonSharedBuffer>` vs `SpawnSyncReturns<NonSharedBuffer>` overload mismatch. Standard and correct.

### Gate 1 PASS

Both fixes are spec-consistent. No deviation from spec in either change.

### Gate 2 FAIL — 4 shallow assertions (carried, unchanged)

None of the 4 open Gate 2 items were addressed by this iteration:
- `scan-diagnostics.test.ts:86` — `assert.ok(result[0]!.hash.length > 0)` — existence check; should assert exact value `'child_failed:42:OOM error occurred'`
- `scan-diagnostics.test.ts:212-213` — `.includes('child_failed')` / `.includes('5')` — substring checks; should assert exact `'Investigate child_failed for issue #5: OOM error occurred'`
- `scan-diagnostics.test.ts:237-238` — `.includes('ALERT')` / `.includes('7')` — substring checks; should assert specific markdown section header and issue number in context
- `scan-diagnostics.test.ts:416` — `assert.ok(written['/ses/diagnostics.json'])` — existence-only; should parse and assert array length, type, severity, and suggested_fix fields

### Gate 3 FAIL — cleanStaleSessions branch coverage (carried, unchanged)

`cleanStaleSessions` branch where `staleIds.length > 0` but no issue's `child_session` matches a stale ID: `changed` stays false, `orchestrator.json` not rewritten. Still no test for this path.

### Gates 4, 5, 6, 7, 8, 9, 10 PASS

Gate 4: no dead code remains after `now` param removal. Gate 5: `npm test` 0 failures, `tsc --noEmit` clean, `npm run build` clean. Gates 6-9: internal fixes, no proof/UI/version/doc changes. Gate 10: no `QA_COVERAGE.md` exists — passes by convention.

---
