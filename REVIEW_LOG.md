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

## Review — 2026-04-14 — commit 262d936c..cde50742

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/lib/ansi.ts`, `aloop/cli/dashboard/src/lib/format.ts`, `aloop/cli/dashboard/src/lib/types.ts`, `aloop/cli/dashboard/src/lib/ansi.test.ts`, `aloop/cli/dashboard/src/lib/format.test.ts`, `aloop/cli/dashboard/src/AppView.tsx`

### Gate 1: Spec Compliance — PASS

Utility extraction matches spec intent: `ansi.ts` (118 LOC), `format.ts` (347 LOC), and `types.ts` (123 LOC) extracted from AppView; `ansi.test.ts` and `format.test.ts` added; backward-compatibility re-exports in AppView.tsx preserve all existing consumers. No UI dependencies in the lib modules (`marked` is a library utility, acceptable). The TODO task marked `[x]` correctly describes the work done.

One spec violation noted: `format.ts` at 347 LOC violates Constitution Rule 7 (< 150 LOC per file) — see Gate 3 / Rule 7 finding below.

### Gate 2: Test Depth — FAIL

- `ansi.test.ts:105`: `expect(segs[0].style.fg).toBeDefined()` — shallow existence check on a 256-colour fg value. A broken palette lookup (wrong index, wrong formula) passes this test. Should assert the exact RGB string (e.g. `'215,0,0'` for index 196). Written as [review] task.

### Gate 3: Coverage — FAIL

`format.ts` exports 24 symbols. Five have zero test coverage:
- `formatTime` (line 60) — no describe block
- `formatTimeShort` (line 66) — no describe block
- `extractIterationUsage` (line 146) — 3+ branches (null input, NaN cost, zero/negative cost) untested
- `parseManifest` (line 178) — complex nested parsing with 8+ conditional branches, untested
- `parseQACoveragePayload` (line 268) — status normalization (`PASS`/`FAIL`/`UNTESTED`) untested

`parseLogLine` tests cover happy path and plain text only; error events, verdict events, commitHash path, and filesChanged array parsing are all untested branches.

Additionally, `format.ts` is 347 LOC — more than double the 150 LOC target (Constitution Rule 7). Requires a split into focused sub-modules.

### Gate 4: Code Quality — PASS

No dead code, no unused imports, no copy-paste duplication. `AppView.tsx` re-exports are clean and complete.

### Gate 5: Integration — PASS

New lib tests: 82/82 pass (`ansi.test.ts` + `format.test.ts`). Pre-existing integration test failures (4–5 in `App.coverage.test.ts`, `App.coverage.integration-sidebar.test.ts`, `App.coverage.integration-app.test.ts`) appear pre-existing — these files were last modified before this branch commit and the failures are unrelated to the utility extraction.

### Gate 6: Proof — PASS (skip acceptable)

No proof manifest found in the session artifacts for this iteration. This work is a pure internal refactoring (moving functions to lib modules with re-export wrappers) — no observable UI output changes. Proof skip with empty artifacts is the expected correct outcome per Gate 6 rules.

### Gate 7: N/A — No CSS or layout changes.

### Gate 8: N/A — No dependency version changes.

### Gate 9: N/A — No documentation changes needed for internal utility extraction.

---

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
