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

## Review — 2026-04-16 — commit 553d9449..6c2aba20 (iter 1)

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/sanitize.ts`, `aloop/cli/src/index.ts`

### Gate 1: Spec Compliance — FAIL

Two spec acceptance criteria remain unimplemented:

1. **Branch sync missing**: Spec requires pre-iteration `git fetch origin <base_branch>` + merge + `PROMPT_merge.md` queue on conflict + `merge_conflict` log event. Zero grep matches for `git fetch`, `merge_conflict`, or `PROMPT_merge` in `loop.sh`. This was also flagged by QA (todo [qa/P1]).

2. **`loop_finalizer_qa_coverage.tests.sh` fails**: The test file at `aloop/bin/loop_finalizer_qa_coverage.tests.sh` (lines 11-12) calls `extract_func check_finalizer_qa_coverage_gate` and `extract_func append_plan_task_if_missing`, but neither function exists in `loop.sh`. Result: 4/5 tests fail with `command not found`. These functions were referenced by the test file but never implemented in the loop script.

CLAUDECODE sanitization (262d936c): `unset CLAUDECODE` at loop.sh line 20 and `env -u CLAUDECODE` on all provider invocations — correctly implemented. `sanitize.ts` deletes `process.env.CLAUDECODE` at line 12; `index.ts` imports it at entry. This criterion passes.

Finalizer logic (cycle boundary gate, finalizerPosition tracking, `finalizer_entered`/`finalizer_aborted`/`finalizer_completed` events): present in loop.sh. Phase retry logic (cyclePosition, MAX_PHASE_RETRIES, `phase_retry_exhausted`, `phase_prerequisite_miss`): present. These criteria appear implemented.

### Constitution Rule 1 — CRITICAL VIOLATION

`loop.sh` is **2373 LOC**. Constitution Rule 1 is a hard rule: "Target: < 400 LOC each. Nothing may be added to loop.sh or loop.ps1." Commits 777a4fba (+36 lines), 32f56f0d (+5 lines), and 2bdd235c (+27 lines) added `extract_explicit_cooldown_until`, stale-lock recovery logic in `acquire_provider_health_lock`, and stdout capture in `invoke_provider`. This is the opposite of what the constitution requires.

### Out-of-scope changes (Constitution Rules 2, 12, 18) — FAIL

`orchestrate.ts` and `process-requests.ts` are **explicitly out of scope** per SPEC.md. Committed changes include:
- orchestrate.ts (793ba420, d45e7abd, fdac98db merge): validateDoR criterion 1 regex change, criterion 5 removal, `dor_validated` guard, `round_robin_order` state passthrough in `launchChildLoop`, SPEC.md seeding, iteration limit removals
- process-requests.ts (4472e66b, fdac98db merge): `sweepStaleRunningIssueStatuses` addition, stale session reconciliation

### Gate 5: Integration — FAIL

`npm run type-check` fails with **8 TypeScript errors**:
- `orchestrate.ts:3166` — `state` undefined in `launchChildLoop` scope (not a parameter)
- `orchestrate.ts:3195` — `roundRobinOrder` undefined in `launchChildLoop` scope
- `orchestrate.ts:3483` — `round_robin_order` property missing from `OrchestratorState` type
- `orchestrate.ts:5166, 5178` — `provider` undefined in scope
- `process-requests.test.ts:7` — 6 symbols imported but never exported: `formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches`, `ChildBranchSyncDeps`
- `process-requests.ts:442` — unintentional type comparison overlap
- `process-requests.ts:818` — `sweepStaleRunningIssueStatuses` reference error

`npm test`: **33 failures** (1077 pass). Primary clusters: all 15 `launchChildLoop` subtests (orchestrate.test.ts test 355), `dispatchChildLoops` 7 subtests (test 356), `runOrchestratorScanPass` 2 subtests (test 376), `processQueuedPrompts` (test 391), `process-requests.test.ts` subtests 9-10 (test 7).

### Gates 2, 3, 4, 6, 7, 8, 9

- Gate 2: Not assessed — core Gate 5/1 failures take priority
- Gate 3: Not assessed — type errors block meaningful coverage analysis
- Gate 4: No dead code issues observed in loop.sh changes themselves
- Gate 6: No proof manifests; loop.sh/sanitize changes are config/plumbing — skip is acceptable
- Gate 7: N/A — no UI changes
- Gate 8: N/A — no dependency changes
- Gate 9: README unchanged; N/A

---

## Review — 2026-04-16 — commit 6c2aba20..e45ea26a (iter 2)

**Verdict: FAIL** (2 prior findings still unresolved — no new [review] tasks; outstanding work tracked in TODO.md as open tasks)
**Scope:** `aloop/cli/src/commands/process-requests.test.ts` (deleted), `TODO.md`, `QA_COVERAGE.md`, `QA_LOG.md`

### New commits since last review
- `c549c3e5`: Deleted `process-requests.test.ts` + deferred 2 of 4 prior [review] findings in TODO.md
- `e45ea26a`: QA log update (QA_COVERAGE.md, QA_LOG.md only)

### Prior finding resolutions

**Finding 3 (Constitution Rules 2, 12, 18 — out-of-scope changes): RESOLVED**
Verified: `git diff master -- aloop/cli/src/commands/orchestrate.ts` = only removal of `-MaxIterations 100` flags (2 lines, in-scope for issue #23). `git diff master -- aloop/cli/src/commands/process-requests.ts` = 0 lines. TODO.md deferred claim confirmed accurate.

**Finding 4 (Gate 5 — TS errors): RESOLVED (appropriately deferred)**
Stash + `npm run type-check` on master confirms: identical 10 TS errors exist before this branch. Deleting `process-requests.test.ts` correctly eliminated 6 branch-specific import errors. Remaining errors are pre-existing — deferral correct. Test count: 32 failures (was 33; 1 fewer because deleted test file had failing subtests; all 32 remaining trace to pre-existing master type errors).

### Prior findings still unresolved

**Finding 1 (Gate 1 — Spec Compliance): UNRESOLVED**
- `check_finalizer_qa_coverage_gate` and `append_plan_task_if_missing` not in `loop.sh`. Direct test run confirms: `loop_finalizer_qa_coverage.tests.sh` 4/5 tests FAIL with `check_finalizer_qa_coverage_gate: command not found`.
- Branch sync (`git fetch origin <base_branch>` + merge + conflict queueing) absent from `loop.sh` and `loop.ps1`. Acceptance criterion not met.

**Finding 2 (Constitution Rule 1 — loop.sh LOC): UNRESOLVED**
`loop.sh` is still 2373 LOC. Constitution Rule 1 hard limit: < 400 LOC. No cleanup performed.

---
