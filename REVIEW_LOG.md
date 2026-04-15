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

## Review — 2026-04-15 — commit 553d9449..cb8c79c7

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/templates/PROMPT_final-qa.md`, `aloop/bin/loop.ps1`, `aloop/bin/loop_finalizer_qa_coverage.tests.sh`

### Gate 1: Spec Compliance — FAIL

`aloop/templates/PROMPT_final-qa.md` itself passes all 7 content acceptance criteria:
- ✅ AC1: finalizer-specific section present before `{{include:instructions/qa.md}}`
- ✅ AC2: reads QA_COVERAGE.md, computes `total_features`, `untested_count`, `fail_count`, `coverage_percent`
- ✅ AC3: Gate A — if untested > 30%, file one `[qa/P1]` TODO per untested feature and stop
- ✅ AC4: Gate B — if fail_count > 0, file one `[qa/P1]` TODO per FAIL feature and stop
- ✅ AC5: normal QA proceeds only when fail_count == 0 AND untested ratio <= 30%
- ✅ AC6: completion requires coverage >= 70%, fail_count == 0, no [qa/P1] TODOs
- ✅ AC7: coverage summary block required in every QA_LOG.md session entry

**AC8 fails** — two out-of-scope files remain modified:

1. `aloop/bin/loop.ps1` — commit `3a2b184f` changed the threshold from 30→20 and was NOT reverted (only loop.sh was reverted in `d1bf02cd`). Current state: `loop.ps1:919` checks `if ($untestedPct -gt 20)` and line 921 prints `<=20%`. Spec says 30%. File is explicitly out of scope. This is both a scope violation and a threshold correctness bug.

2. `aloop/bin/loop_finalizer_qa_coverage.tests.sh` — file still exists (created during this branch) with modified fixture data. It exists solely to test the out-of-scope loop.sh coverage gate functions. Should be removed.

### Gates 2, 3, 4: N/A / Pass

- Gate 2: PROMPT_final-qa.md is a prompt template, not executable code — no unit tests apply.
- Gate 3: N/A (prompt file, no branch coverage metric).
- Gate 4: PROMPT_final-qa.md is clean — no dead instructions, no leftover comments, no duplication.

### Gate 5: Integration — Deferred

Prior QA iterations confirmed 452 CLI tests and 148 dashboard tests pass. Pre-existing loop.sh and loop.ps1 test failures are unrelated to this prompt change. Cannot re-run full suite in review context.

### Gates 6, 7, 8, 9: N/A / Pass

- Gate 6: Template/prompt-only change with no observable output — proof skip with empty artifacts is the correct outcome per gate rules. No rejection.
- Gate 7: N/A (no UI changes).
- Gate 8: N/A (no dependency changes).
- Gate 9: README not affected by this prompt-only change.

---
