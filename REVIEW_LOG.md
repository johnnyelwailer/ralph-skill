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
