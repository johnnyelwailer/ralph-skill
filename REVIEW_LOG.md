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
