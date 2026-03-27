# Review Log

## Review — 2026-03-24 — commit 4a136add..5561e29f

**Verdict: FAIL** (4 findings → 2 [review] tasks written to TODO.md; 1 QA bug pre-exists)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/setup.ts`, `aloop/cli/src/commands/setup.test.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/commands/project.ts`, `aloop/cli/src/commands/start.ts`, `aloop/cli/lib/project.mjs`

### Findings

- **Gate 1 (partial):** 2 spec acceptance criteria remain open: "GitHubAdapter wraps all existing `gh` CLI calls" and "`orchestrate.ts` uses adapter interface, not raw `execGh`". The builder migrated 6 specific functions (checkPrGates, mergePr, flagForHuman, createPrForChild, processPrLifecycle, runOrchestratorScanPass) but left ~31 execGh calls for GraphQL, custom commands, and API calls. The spec says "all" — the migration is partial. This is the intended incremental approach per the builder's TODO notes, but it doesn't satisfy the spec criteria. Noted as context; the pre-existing [qa/P1] test failure task covers the actionable remediation path.

- **Gate 2/3 (FAIL):** `adapter.ts` is a new module (90% branch coverage required). Three methods have zero tests: `GitHubAdapter.updateIssue` (has close/reopen branching logic), `LocalAdapter.mergePr` (3 merge methods + deleteBranch), `LocalAdapter.getPrStatus` (success vs. git error paths). Written as `[review]` task in TODO.md.

- **Gate 4 (FAIL):** Dead code in `adapter.ts`: `parseRepoSlug` imported at line 14 but never called. `existsSync` checks at lines 394 and 403–404 are unreachable after `ensureDirs()` creates the directory on the preceding line. Written as `[review]` task in TODO.md.

- **Gate 5 (FAIL):** 25 orchestrate.test.ts failures confirmed (documented as [qa/P1] in TODO.md before this review). Tests for `checkPrGates`, `reviewPrDiff`, `launchChildLoop`, `validateDoR`, and others fail because they mock `execGh` directly but the migrated code now calls through the adapter interface. Type-check reports 1 error (`process-requests.ts:407` compares `issue.state` to `'review'` which is not in `OrchestratorIssueState`) — confirmed pre-existing since the same line existed before these commits.

### Gates that Pass

- **Gate 6:** Work is purely internal (interface definition + migration plumbing). No observable output. Skipping proof is the correct outcome.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changes; README/docs not affected.
- **setup.ts/setup.test.ts:** Adapter prompt added correctly. Test updated with prompt count (10→11) and `scaffoldCalledOpts.adapter === 'local'` assertion — specific and correct.
- **adapter.test.ts (covered paths):** Existing tests use concrete values (exact issue numbers, exact label arrays, specific error messages). Gate 3 failure is scoped to the three missing methods only.
- **Acceptance criteria update:** Marked AC items 5 and 6 as complete in TODO.md (`adapter` in meta.json is written via `start.ts`; no hardcoded GitHub URLs in code).

---

## Review — 2026-03-24 — commit aae3501b..03f10536

**Verdict: FAIL** (2 findings → 2 [review] tasks written/updated in TODO.md)
**Scope:** `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

### Prior Findings Resolution

- **Prior Gate 2/3 (resolved):** 9 new tests added in `1c3ca1b8` covering `GitHubAdapter.updateIssue` (3 tests: title/body args, close path, reopen path), `LocalAdapter.mergePr` (4 tests: squash default, rebase, merge --no-ff, deleteBranch=false), `LocalAdapter.getPrStatus` (2 tests: CLEAN on success, UNKNOWN on error). All use `assert.equal` / `assert.ok(...includes(...))` on concrete values — not shallow. Finding resolved.

- **Prior Gate 4 (NOT resolved):** `parseRepoSlug` unused import (line 14) and unreachable `existsSync` checks (lines 394, 404) still present in `adapter.ts`. TODO.md note updated to record "still present at iter 3". Task remains open.

- **Prior Gate 5 / QA P1 (resolved):** All 25 orchestrate.test.ts failures fixed in `a03fb518`. Current test count: 1054 pass, 0 fail across all test files. Pre-existing type error at `process-requests.ts:407` unchanged (pre-exists all issue-176 work).

### New Findings

- **Gate 2/3 (FAIL — new):** `applyEstimateResults` in `orchestrate.ts:2432` gained a new branch in `a03fb518`: `if (issue.status === 'Needs refinement' || issue.status === 'Needs decomposition')`. The `Needs decomposition` arm is untested — all `applyEstimateResults` tests use `status: 'Needs refinement'` as input. A broken `Needs decomposition` → `Ready` transition would not be caught. Written as new `[review]` task in TODO.md.

- **Gate 4 (carry-over — still open):** See above. Updated TODO.md note.

### Gates that Pass

- **Gate 1:** Spec compliance unchanged from prior review — same 2 open AC items (partial migration), not addressed in this iteration.
- **Gate 5:** All tests pass (1054/1054). Type-check pre-existing error unchanged, not introduced by these changes.
- **Gate 6:** Work is internal (test fixes, QA updates). No observable output required.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changes; README/docs not affected.
- **Gate 10:** QA_COVERAGE.md covers 8 features, all documented. Coverage tracking current.

---

## Review — 2026-03-24 — commit b3169cdc..7fdb9320

**Verdict: PASS** (all prior findings resolved; 2 observations)
**Scope:** `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/lib/adapter.ts`, `QA_LOG.md`, `QA_COVERAGE.md`, `TODO.md`

### Prior Findings Resolution

- **Prior Gate 2/3 (resolved):** `applyEstimateResults` `Needs decomposition → Ready` branch now tested in commit 6cc0e592. Test at `orchestrate.test.ts:2139-2153` asserts `outcome.updated = [1]`, `outcome.blocked = []`, `dor_validated = true`, `status = 'Ready'` — all concrete values. A broken transition would fail the test. Finding resolved.

- **Prior Gate 4 (resolved):** Dead code fully removed in commit c37c7334:
  - `import { existsSync } from 'node:fs'` — removed (was unused after guard removal)
  - `parseRepoSlug` — removed from github-monitor import
  - `if (!existsSync(this.issuesDir)) return 1` in `nextIssueNumber` — removed
  - `if (!existsSync(this.prsDir)) return 1` in `nextPrNumber` — removed
  Confirmed: `grep parseRepoSlug\|existsSync src/lib/adapter.ts` returns no output. Finding resolved.

### Observations

- **Gate 2 (concrete assertion):** `orchestrate.test.ts:2152` asserts `assert.equal(state.issues[0].status, 'Ready')` after a `dor_passed: true` result on a `Needs decomposition` issue — exactly the branch that was previously unexercised. Not shallow.

- **Gate 5:** 341/341 orchestrate.test.ts pass, 56/56 adapter.test.ts pass. Full suite: 1069/1071 pass; 1 pre-existing failure (`index.test.ts: CLI catches errors`) documented as `[qa/P1]` in TODO.md. Pre-existing TS2367 type error (`process-requests.ts:407`) documented as `[qa/P1]`. Neither failure introduced by this iteration.

### Gates that Pass

- **Gate 1:** No change to spec compliance posture. 2 AC items remain open (partial adapter migration) — pre-existing, tracked.
- **Gate 2:** New test uses concrete values; passes for correct implementation, would fail on regression.
- **Gate 3:** Prior coverage gaps resolved. No new untested branches introduced.
- **Gate 4:** Dead code fully removed. No new dead code introduced.
- **Gate 5:** 1069/1071 tests pass. Both failures pre-exist this iteration.
- **Gate 6:** Purely internal changes (test additions + dead code removal). No observable output required; skipping is correct.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changes; README/docs not affected.

---

## Review — 2026-03-27 — commit ab8a1c4c..80c9519e

**Verdict: FAIL** (2 findings → 2 [review] tasks written to TODO.md)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `QA_LOG.md`, `QA_COVERAGE.md`

### What Changed Since Last PASS

- `f41f03220`: Removed `LocalAdapter` from `adapter.ts`; scoped PR to adapter.ts + adapter.test.ts only
- `0f7141151`: Removed adapter-optional code paths from triage and spec-question functions in `orchestrate.ts`, keeping only the `execGh` path
- `29f3b670`: Added `closePr`, `getPrDiff`, `queryPrs`, `checkBranchExists` to interface + GitHubAdapter; import of `createAdapter`/`OrchestratorAdapter` added to orchestrate.ts but neither is used
- `29bf3459`: Unit tests for the four new methods
- `80c9519e`: QA — 38/38 adapter tests pass; TypeScript errors confirmed pre-existing

### Findings

- **Gate 4 (FAIL):** Dead import in `orchestrate.ts:19` — `import { createAdapter, type OrchestratorAdapter } from '../lib/adapter.js'` is present but neither `createAdapter` nor `OrchestratorAdapter` appears anywhere else in the file (`grep -c adapter orchestrate.ts` = 1, the import line only). Constitution Rule 13: no dead code. The import was added in `29f3b670` as part of migration intent but the actual wiring was not completed / was removed in `0f7141151`. Remove the unused import. Written as `[review]` task in TODO.md.

- **Gate 4 (FAIL):** `adapter.ts` reached 350 lines after the four new methods were added. SPEC-ADDENDUM.md states "Files above 300 LOC are a code smell and must be decomposed before adding new features." The prior file (post-LocalAdapter removal) was under 300 lines; adding the new methods pushed it over the threshold without a split. Split the implementation (e.g., extract GitHubAdapter methods into `adapter-github.ts`) or restructure to keep `adapter.ts` under 300 lines. Written as `[review]` task in TODO.md.

### Prior Findings Resolution

- All findings from the prior PASS review were confirmed resolved (dead code removed, tests added). No regressions from that work.

### Gates that Pass

- **Gate 1:** No regression from prior posture. SPEC-ADDENDUM criterion "orchestrate.ts uses adapter interface" remains open but unaddressed in this iteration — scope was explicitly narrowed to adapter.ts + adapter.test.ts. No new violations beyond the dead import (captured in Gate 4).
- **Gate 2:** New tests for `closePr` (deepEqual exact args), `getPrDiff` (checks concrete string content), `queryPrs` (exact length, number, url substring), `checkBranchExists` (assert.equal true/false) — not shallow. `closePr` with comment uses `assert.ok(calledArgs.includes('--comment'))` and checks the exact comment string.
- **Gate 3:** Four new methods each have at least 2 test cases covering the primary code paths; 38/38 pass.
- **Gate 5:** 38/38 adapter tests pass. TypeScript errors in `process-requests.ts`, `requests.ts`, and `gh.test.ts` are all pre-existing on master (confirmed: `process-requests.ts` not modified by this branch; errors present on master).
- **Gate 6:** Work is purely internal (interface additions + unit tests). `artifacts/iter-16/output.txt` contains a test run summary; for internal-only changes skipping proof or providing test evidence is acceptable per Gate 6 rules.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changed; README/docs not affected.

---

## Review — 2026-03-27 — commit 38b54a865..23073f48a

**Verdict: FAIL** (1 finding — carry-over; 0 new findings)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/index.test.ts`, `aloop/cli/QA_COVERAGE.md`, `aloop/cli/QA_LOG.md`

### Prior Findings Resolution

- **Prior Gate 4 (dead import — RESOLVED):** `import { createAdapter, type OrchestratorAdapter }` removed from `orchestrate.ts` in `44cd350f8`. Confirmed: `grep createAdapter src/commands/orchestrate.ts` returns no output. Finding resolved.

- **Prior qa/P1 (index test — RESOLVED):** `index.test.ts` changed from `spawn(process.execPath, ['--import', 'tsx', ...])` to `spawn('npx', ['-y', 'tsx', ...])` with `node_modules/.bin` prepended to PATH. All 5/5 index tests now pass (confirmed: `node --test src/index.test.ts` → 5 pass, 0 fail). Test 5 ("CLI catches errors and prints clean messages without stack traces") — previously failing with `ERR_MODULE_NOT_FOUND` — now passes. Finding resolved.

- **Prior Gate 4 (adapter.ts LOC — NOT RESOLVED):** `adapter.ts` remains at 350 lines; the 300 LOC threshold from SPEC-ADDENDUM.md is still violated. `[review]` task remains open in TODO.md — no iteration addressed it.

### Findings

- **Gate 4 (FAIL — carry-over):** `adapter.ts` is 350 lines. SPEC-ADDENDUM.md: "Files above 300 LOC are a code smell and must be decomposed before adding new features." The `[review]` task in TODO.md is the only outstanding blocker.

### Gates that Pass

- **Gate 1:** No spec compliance regression. Accepted carry-over (`orchestrate.ts` partial migration) unchanged.
- **Gate 2:** `index.test.ts` fix uses `spawn('npx', ['-y', 'tsx', ...])`. Test 5 asserts stderr matches exact pattern `^Error: Invalid autonomy level: invalid`. Not shallow.
- **Gate 3:** No new modules. Import removal reduces code surface; no new branches requiring coverage.
- **Gate 5:** 82 pre-existing failures unchanged (verified at both 38b54a865 and HEAD: 1103 tests, 82 fail). 71 TypeScript errors all pre-existing. 5/5 index tests now pass.
- **Gate 6:** Import removal + test infra fix — purely internal. No observable output required.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changed.
- **Gate 10:** QA_COVERAGE.md current — 7 features tracked, 6 PASS / 1 FAIL (adapter LOC). Tracking reflects actual state.

---

## Review — 2026-03-27 — commit 1446f4d35..265501b63

**Verdict: PASS** (2 prior findings resolved; 2 observations)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter-github.ts`, `aloop/cli/src/commands/process-requests.ts`, `QA_COVERAGE.md`, `QA_LOG.md`

### Prior Findings Resolution

- **Prior Gate 4 (adapter.ts LOC — RESOLVED):** `adapter.ts` split in `83b6b38e3`. `adapter.ts` is now 115 lines (interface + factory + re-export only). `GitHubAdapter` extracted to `adapter-github.ts` at 252 lines. Both files under 300 LOC threshold. Finding resolved.

- **Prior Gate 4 (dead import in process-requests.ts — RESOLVED):** `import { createAdapter }` removed from `process-requests.ts` in `426dbd5ed`. Confirmed: `grep createAdapter src/commands/process-requests.ts` returns no output. Finding resolved.

### Observations

- **Gate 4 (clean split):** `adapter.ts` now serves purely as the interface + factory barrel — 115 lines, no implementation. `adapter-github.ts` imports types back from `adapter.js` and is self-contained at 252 lines. No circular dependency issues, no stray imports.

- **Gate 5:** Full test suite at 1103 tests, 1020 pass, 82 fail — identical to prior iteration (82 pre-existing failures on master, unchanged). 38/38 adapter tests pass after the file split (`npx tsx --test src/lib/adapter.test.ts` => 38 pass, 0 fail). The `adapter.test.ts` imports from `./adapter.js` which re-exports `GitHubAdapter` from `adapter-github.js` — tests exercise all methods through the same surface.

### Gates that Pass

- **Gate 1:** No spec compliance regression. Open AC ("orchestrate.ts uses adapter interface") pre-exists; no new violations.
- **Gate 2:** No test changes; 38/38 concrete-value tests unchanged.
- **Gate 3:** Pure refactor (no new branches). Same 38 tests cover the same code paths in `adapter-github.ts`.
- **Gate 4:** `adapter.ts` = 115 LOC, `adapter-github.ts` = 252 LOC — both under 300 LOC. No dead imports anywhere in changed files.
- **Gate 5:** 1020/1103 pass; 82 failures are all pre-existing on master. Type-check errors all pre-existing (requests.ts/requests.test.ts, not touched by this iteration).
- **Gate 6:** Purely internal refactor (file split + dead import removal). No observable output required; skipping proof is correct.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior changed; README/docs not affected.
- **Gate 10:** QA_COVERAGE.md current — 9 features tracked, all 9 PASS. Coverage up from 7 to 9 features since last FAIL review.

---

## Review — 2026-03-27 — commit 5218a6cd5..a379d35f1

**Verdict: PASS** (QA tracking commit only; all findings from prior PASS carry over resolved)
**Scope:** `QA_COVERAGE.md`, `QA_LOG.md`

### What Changed Since Last PASS

- `a379d35f1`: Final regression QA pass — updated `QA_COVERAGE.md` commit references to `5218a6cd5`; appended QA session iter-4 to `QA_LOG.md` with command transcript showing 38/38 adapter tests, 5/5 index tests, LOC checks, dead-import checks, and built-artifact URL scan all PASS.

### Findings

None — no functional code changes in this commit.

### Observations

- **Gate 5 (verified):** `npx tsx --test src/lib/adapter.test.ts` → 38 pass, 0 fail. `npx tsx --test src/index.test.ts` → 5 pass, 0 fail. Confirmed live.
- **Gate 4 (clean):** `grep createAdapter|OrchestratorAdapter src/commands/orchestrate.ts src/commands/process-requests.ts` returns no output. LOC: adapter.ts=115, adapter-github.ts=252 — both under 300 LOC threshold. Confirmed live.
- **Gate 6:** QA_LOG.md iter-4 contains a complete command transcript with concrete counts (not just "tests pass"). Valid QA evidence.

### Gates that Pass

- **Gate 1:** No change to spec compliance posture. 2 AC items remain open (orchestrate.ts migration, LocalAdapter) — pre-existing, explicitly scoped out of this PR.
- **Gate 2:** No test changes.
- **Gate 3:** No new code; no new branches.
- **Gate 4:** QA tracking files only; no dead code introduced.
- **Gate 5:** 38/38 adapter tests + 5/5 index tests confirmed passing live at HEAD.
- **Gate 6:** QA_LOG.md contains command transcript with specific counts — valid evidence for QA iteration.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** No user-facing behavior or docs changed.

---

## Review — 2026-03-27 — commit c1c178848..2a17f66d4

**Verdict: PASS** (docs/tracking commits only; all prior findings remain resolved)
**Scope:** `TODO.md`, `QA_COVERAGE.md`, `QA_LOG.md`

### What Changed Since Last PASS

- `dad206220`: Updated TODO.md AC text only — corrected "dead import remains" → "dead imports already removed" in the `orchestrate.ts` acceptance criterion. Accurate: grep returns no output for createAdapter/OrchestratorAdapter in orchestrate.ts and process-requests.ts (exit 1).
- `2a17f66d4`: QA tracking — updated `QA_COVERAGE.md` commit references from `5218a6cd5` → `dad206220`; appended iter-5 session to `QA_LOG.md` with complete command transcript (38/38 adapter tests, 5/5 index tests, LOC checks, dead-import checks, built-artifact URL scan — all PASS).

### Findings

None — no functional code changes in either commit.

### Observations

- **Gate 4 (clean):** Dead imports confirmed absent in orchestrate.ts and process-requests.ts (grep returns no output at HEAD). No new dead code.
- **Gate 5:** 38/38 adapter tests pass, 5/5 index tests pass at HEAD. TypeScript errors all pre-existing in requests.ts/requests.test.ts (not touched by this branch).
- **Gate 9 (accurate):** TODO.md AC text correction is factually accurate — dead import removal confirmed live by grep (exit 1).

### Gates that Pass

- **Gate 1:** No change to spec compliance posture. 2 ACs remain open (orchestrate.ts migration, LocalAdapter) — pre-existing, explicitly scoped out of this PR.
- **Gate 2:** No code changes; N/A.
- **Gate 3:** No code changes; N/A.
- **Gate 4:** Doc-only changes; no dead code introduced.
- **Gate 5:** 38/38 adapter tests + 5/5 index tests confirmed passing live at HEAD. All TypeScript errors pre-existing on master.
- **Gate 6:** Both commits are docs/tracking. No observable output required; skipping is correct.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** TODO.md clarification is accurate. QA_COVERAGE.md commit references updated correctly.

---

## Review — 2026-03-27 — commit 12c916034..e7425bc60

**Verdict: PASS** (QA tracking commit only; all prior findings remain resolved)
**Scope:** `QA_COVERAGE.md`, `QA_LOG.md`

### What Changed Since Last PASS

- `12c916034`: Review commit — appended REVIEW_LOG.md entry for `c1c178848..2a17f66d4` PASS verdict.
- `e7425bc60`: QA tracking — updated `QA_COVERAGE.md` commit references from `dad206220` → `12c916034` (9 rows); appended iter-6 session to `QA_LOG.md` with complete command transcript.

### Findings

None — no functional code changes in either commit.

### Observations

- **Gate 5 (verified live):** 38/38 adapter tests pass (`node_modules/.bin/tsx --test src/lib/adapter.test.ts`). 5/5 index tests pass (`node_modules/.bin/tsx --test src/index.test.ts`). Both confirmed at HEAD.
- **Gate 4 (clean):** `grep createAdapter|OrchestratorAdapter orchestrate.ts process-requests.ts` → 0 matches (exit 1). LOC: `adapter.ts` = 115, `adapter-github.ts` = 252 — both under 300 threshold.

### Gates that Pass

- **Gate 1:** No change to spec compliance posture. 2 ACs remain open (orchestrate.ts migration, LocalAdapter) — pre-existing, explicitly scoped out of this PR.
- **Gate 2:** No code changes; N/A.
- **Gate 3:** No code changes; N/A.
- **Gate 4:** Tracking-file updates only; commit hash references updated accurately. No dead code introduced.
- **Gate 5:** 38/38 adapter tests + 5/5 index tests confirmed passing live at HEAD. All TypeScript errors pre-existing on master.
- **Gate 6:** Both commits are review/QA tracking. No observable output required; skipping is correct.
- **Gate 7:** N/A — no UI changes.
- **Gate 8:** No dependency changes.
- **Gate 9:** QA_COVERAGE.md commit references updated to current HEAD hash. Accurate.

---
