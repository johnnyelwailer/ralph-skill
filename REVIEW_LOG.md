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

## Review — 2026-04-13 — commit 553d9449..f4315eca

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop_branch_coverage.tests.sh`, `aloop/bin/loop.tests.ps1`

### Gate 1: Constitution Rule 1 — FAIL

`loop.sh` grew +92 LOC (2329→2421) and `loop.ps1` grew +93 LOC (2388→2481). Constitution Rule 1 is unambiguous: "Nothing may be added to loop.sh or loop.ps1. Any PR that touches these files must reduce their line count." The SPEC (§ "Branch Sync & Auto-Merge") explicitly calls for pre-iteration sync in the loop scripts ("This is the one piece of git awareness the loop script has"), creating a direct SPEC↔CONSTITUTION conflict. The Constitution intro states: "If an issue's scope conflicts with a rule, flag it — do not implement the violation." The builder should have escalated to the orchestrator/human rather than implementing in the loop scripts.

### Gate 1: Spec Logic Error (infinite conflict loop) — FAIL

`sync_branch()` calls `git merge --abort` (loop.sh:2161) **before** returning on conflict, then queues `PROMPT_merge.md` in `queue/000-merge-conflict.md`. The merge agent's process step 1 is `git diff --name-only --diff-filter=U` to find conflicted files. After abort, there are zero conflicted files — the agent resolves nothing. `run_queue_if_present` consumes and removes the queue file. Next iteration: `sync_branch` hits the same conflict, aborts again, queues again → infinite loop. Fix: remove `git merge --abort`; leave conflict markers in the working tree for the agent.

### Gate 2: sync.conflict test validates wrong behavior — FAIL

`loop_branch_coverage.tests.sh` (around line 1190) asserts `! git diff --name-only --diff-filter=U | grep -q .` as a PASS — validating that the merge IS aborted and NO conflict markers remain. This tests the wrong behavior. Should assert unmerged paths ARE present. `loop.tests.ps1` has the equivalent error: `$unmerged | Should -BeNullOrEmpty` should be `Should -Not -BeNullOrEmpty`.

### Gates passing

- Gate 2 (other tests): `up_to_date`, `merged`, `fetch_failure`, `disabled` cases all use concrete value assertions (specific log event fields, exact counts). Thorough.
- Gate 3: 57/57 branch coverage (100%).
- Gate 4: No dead code. `write_log_entry_mixed` correctly used for `branch_sync` (numeric `merged_commit_count` field). Clean function structure.
- Gate 5: Tests pass 57/57. No regressions.
- Gate 6: N/A — internal loop behavior, no UI/API observable output. Proof skip acceptable.
- Gates 7, 8, 9: N/A for shell script changes.
