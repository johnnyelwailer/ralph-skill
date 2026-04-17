# Review Log

## Review — 2026-04-13 — commit aff01407..33cfe894

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `.github/workflows/ci.yml`, `README.md`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

### Gate 1: Spec Compliance — FAIL

The CI workflow (`ci.yml`) itself satisfies all 8 acceptance criteria from TASK_SPEC.md:
- ✅ ci.yml exists
- ✅ push + pull_request triggers on master, agent/*, aloop/*
- ✅ CLI tests via `bun run test` (correctly changed from `bun test` — bun's native runner incompatible with node:test)
- ✅ Dashboard tests via `npm test`
- ✅ Type checks for both CLI and dashboard packages
- ✅ Loop shell tests on Linux (7 suites including bats)
- ✅ PowerShell tests on Windows
- ✅ README CI badge at line 1

**However**, commit `aec9e571` made substantial changes to `aloop/cli/src/commands/orchestrate.ts` and `orchestrate.test.ts` — both explicitly listed as **Out of Scope** in TASK_SPEC.md: "Runtime/orchestrator logic changes in `aloop/cli/src/**` (Constitution Rules 2 and 6)". This violates Constitution Rules 12 (one issue, one concern) and 18 (respect file ownership).

Five behavior changes were bundled into this CI issue:
1. `validateDoR`: changed acceptance criteria detection regex
2. `validateDoR`: removed criterion 5 (dor_validated circular check)
3. `getDispatchableIssues`: added `dor_validated` guard
4. `applyEstimateResults`: expanded status progression from `Needs refinement` to 3 statuses
5. `checkPrGates`: changed 'pass' to 'pending' when CI workflows exist but no checks ran
6. `reviewPrDiff`: changed 'flag-for-human' → 'approve' when no reviewer configured (**security regression**)
7. `monitorChildSessions`: added `state='failed'`/`status='Blocked'` tracking for stopped children
8. `launchChildLoop`: added SPEC.md seeding from issue body

The `reviewPrDiff` auto-approve change (finding #6) is the most critical: it replaces the safe 'flag-for-human' default with silent auto-approval, enabling automated merges without any review when no reviewer is configured. This is a meaningful weakening of a security gate.

### Gate 2: Test Depth — Pass (conditional on Gate 1)

The orchestrate.test.ts changes that accompany the production changes are technically coherent:
- `dor_validated: false` additions in test fixtures fix a real regression (previously missing flag caused false positives)
- `statusCheckRollup` mock format aligns with actual GitHub GraphQL response shape
- `checkPrGates` test at line ~430: assertion updated to 'pass' on API error (tests gate behavior correctly, not arbitrary)

If Gate 1 findings are resolved (revert out-of-scope changes), this gate passes on the remaining CI-only changes.

### Gate 5: Integration — Conditional pass

On master: 2 pre-existing failures, 963 pass (966 total).
On this branch (worktree context): 24 failures noted, but yaml.test.ts failures appear pre-existing to this branch (yaml.ts/yaml.test.ts not modified). The aec9e571 commit fixed 27 pre-existing orchestrate test failures; yaml failures are separate and pre-date this branch.

### Gate 6: Proof — N/A

No proof manifests found. ci.yml is a config file — CI workflow proof would require triggering an actual GitHub Actions run (impossible in the current environment). Proof skip is acceptable per Gate 6 rules for config-file work.

### Gates 3, 4, 7, 8, 9

- Gate 3: N/A (CI config has no branch coverage metric)
- Gate 4: Out-of-scope changes aside, no dead code or quality issues in ci.yml itself
- Gate 7: N/A (no UI changes)
- Gate 8: No VERSIONS.md entries for GitHub Actions; `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/setup-node@v4`, `actions/upload-artifact@v4` — pinned to major versions (acceptable)
- Gate 9: README line 1 has CI badge pointing to `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg` ✅

## Review — 2026-04-13 — commit ef60dc7e..d0a300bf

**Verdict: PASS** (prior findings resolved)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `.github/workflows/ci.yml`, `README.md`

- Gate 1: orchestrate.ts production code is now identical to master — the 8 out-of-scope behavior changes (including `reviewPrDiff` security regression) have been reverted. Remaining diff is orchestrate.test.ts fixture improvements only (statusCheckRollup format, dor_validated guards in failure-path tests) — no production behavior changes.
- Gate 2: orchestrate.test.ts:2723-2813 — `statusCheckRollup` fixtures correctly match GitHub GraphQL API format; `dor_validated: false` in failure tests makes intent explicit. Thorough.
- Gate 5: QA log confirms 452 CLI tests pass, 148 dashboard tests pass; 2 deferred pre-existing script exit-code bugs (out of scope).
- Gates 3, 6, 7: N/A for CI config work.
- Gate 8: Actions pinned to major versions — acceptable.
- Gate 9: README CI badge present at line 1.

All prior [review] tasks resolved.

---

## Review — 2026-04-17 — commit d0a300bf..18179b5a

**Verdict: FAIL** (1 new finding → written to TODO.md as [review] task; 2 pre-existing open bugs still blocking)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/lib/requests.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `README.md`

### Constitution Rule 1 + Gate 1: FAIL

Commits `777a4fba`, `2bdd235c`, `32f56f0d` — merged in from `agent/trunk` via merge commit `416beb5b` — added substantial new code to `loop.sh`:

- `777a4fba`: Added `HEALTH_LOCK_STALE_SECONDS=30` variable, stale lock recovery block (~25 lines) inside `acquire_provider_health_lock()`, changed `rmdir` to `rm -rf` in `release_provider_health_lock()`
- `2bdd235c`: Added `extract_explicit_cooldown_until()` function (~12 lines) and explicit-cooldown branch in `update_provider_health_on_failure()`
- `32f56f0d`: Added `tmp_stdout` tempfile, stdout pipe in `invoke_provider()` for claude, appended stdout to `LAST_PROVIDER_ERROR`

Net result: `loop.sh` grew from 2329 to 2373 lines (+44). Constitution Rule 1 is explicit: "Nothing may be added to loop.sh or loop.ps1. Any PR that touches these files must reduce their line count." The `write_log_entry "health_lock_failed"` multi-line call was also compressed to a single 185-char line (line 923) — a readability regression that appears intended to partially offset additions but does not bring the file back under the pre-change count.

These three behaviors (cooldown timestamp parsing, stale lock recovery, provider stdout capture) belong in the runtime (`orchestrate.ts` or `process-requests.ts`) if they are needed at all.

`loop.ps1` MaxIterations=0 change and the loop condition change from `100e3b44` are in-scope (orchestrator needs unlimited iterations) and do not add new functions or logic — conditionally acceptable if loop.sh additions are reverted.

### Gate 5: FAIL (pre-existing open bugs — not new findings)

- `npm run type-check` FAILS with 6 errors at `orchestrate.ts:3167,3168,3196` (undefined `state`/`roundRobinOrder` in `launchChildLoop`) and `orchestrate.ts:5168,5180` (undefined `provider` in `processQueuedPrompts`). These were documented in QA iteration 1 and remain open in TODO "Up Next".
- `orchestrate.test.ts`: 25/346 failures — `launchChildLoop` (14), `dispatchChildLoops` (7), `runOrchestratorScanPass` (2), `processQueuedPrompts` (2). Same root cause as type errors above.
- These are tracked as open TODO items, not new findings — but they block the PR.

### What was correctly done

- `cead4460`: `'review'` added to `OrchestratorIssueState` union type — correct fix for TS2367.
- `d263e4fd`: `round_robin_order?: string[]` added to `OrchestratorState` interface — correct fix for TS2339.
- `5636c230`/`bb93b7a3`: Resume stopped child sessions by transitioning state to `in_progress` — correctly implemented; tested in process-requests.test.ts (21/21 PASS).
- `8c2b6b78`: OrchestratorAdapter wired in `process-requests.ts` for issue/PR creation with fallback to direct `execGh` — correct pattern.
- `cffd3444`: Request file paths use `sessionDir/requests/` consistently — correct.
- `76205850`: Missing closing brace in `isChildSessionAlive` — correct.
- `README.md`: Loop cycle description, `--launch-mode resume` → `--launch resume`, OpenCode model IDs — accurate and helpful.
- Gates 2, 3, 6, 7, 8, 9: Pass for the correctly-scoped changes above.

---
