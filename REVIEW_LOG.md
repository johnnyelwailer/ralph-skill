# Review Log

## Review — 2026-03-27 — commits 9773abc30..b64a47316 (first review; no prior log)

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`

### Gate 1 FAIL — Interface shape deviates from spec (SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern")

The `OrchestratorAdapter` interface in `adapter.ts` diverges from the spec-defined contract on multiple points:

- **Method names**: spec defines `listIssues`, `createPR`, `mergePR`, `getPRStatus`; implementation has `queryIssues`, `createPr`, `mergePr`, `getPrStatus`
- **`createIssue` return type**: spec returns `{ number: number; url: string }`; implementation returns `number` (URL discarded)
- **`getPRStatus` return type**: spec returns `{ mergeable, ci_status: 'success'|'failure'|'pending', reviews: [...] }`; implementation returns `{ mergeable, mergeStateStatus: string }` — missing `ci_status` union type and `reviews` array
- **`updateIssue` parameters**: spec has `labels_add?: string[]` and `labels_remove?: string[]` in the update object; implementation has neither (separate `addLabels`/`removeLabels` methods exist but `updateIssue` doesn't accept label mutations)

The spec explicitly states: "The interface above is the target — implement incrementally." The interface is already fully defined in `adapter.ts` — so the names and shapes must match the spec even if not all call sites are migrated yet.

### Gate 2 FAIL — No tests for new adapter instantiation branches

The new `if (filterRepo && !deps.adapter)` block in `orchestrateCommandWithDeps` (~line 1004) and the `const adapter = repo ? createAdapter(...) : undefined` in `processRequestsCommand` (line 323) introduce testable conditional branches that have no corresponding test coverage:

- Existing test `'stores --label and --repo filters'` (orchestrate.test.ts:200) triggers the `filterRepo && !deps.adapter` path but only asserts on `state.filter_label` / `state.filter_repo` — it does NOT verify that `deps.adapter` was populated after the call
- No test covers the negative case (no `repo` → adapter remains undefined)
- `processRequestsCommand` has no unit tests at all in `process-requests.test.ts` — the new adapter creation in that function is entirely untested

### Gate 4 FAIL — Code quality: DI bypass and unnecessary dynamic import

Two issues in `orchestrateCommandWithDeps` ~line 1004–1011:

1. `const { spawnSync: nodeSpawnSync } = await import('node:child_process')` — dynamic import inside a conditional for a built-in module that is always available in Node.js. Must be a static top-level import.

2. `const execGhFn = deps.execGh ?? (async (args) => { const result = nodeSpawnSync('gh', args, ...) ... })` — this fallback silently injects a real child-process-spawning function when `deps.execGh` is absent. All existing tests using `createMockDeps()` omit `execGh`, so every test that passes `repo: '...'` will create an adapter backed by real `spawnSync`. If adapter methods are ever called in those test contexts (which they will be once migration proceeds), tests will attempt real `gh` CLI calls and fail unpredictably. The fallback defeats the dependency injection purpose.

### Gates 3, 5 — Blocked by QA environment

TypeScript build and unit test suite could not be executed (Bash tool non-functional in QA env — tracked as `[qa/P1]` in TODO.md). Gate 3 coverage and Gate 5 regression status not independently verified by this review.

### Gates 6, 7, 8, 9, 10 — Pass / N/A

- Gate 6: Work is purely internal TypeScript type additions and plumbing (no observable output) — skip is correct
- Gate 7: No UI changes
- Gate 8: No new dependencies
- Gate 9: No user-facing behavior changed; docs not required
- Gate 10: QA_COVERAGE.md exists; no stale P1 bugs older than 3 iterations

---

## Review — 2026-03-28 — commits 298ac3309..d49686908 (build iterations 18 + 30)

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/lib/plan.ts`

### Gate 1 — PASS (prior finding resolved)

Interface in `adapter.ts` now exactly matches SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern":
- `listIssues`, `createPR`, `mergePR`, `getPRStatus` — correct names ✓
- `createIssue` returns `{ number, url }` ✓
- `updateIssue` accepts `labels_add`/`labels_remove` ✓
- `getPRStatus` returns `{ mergeable, ci_status, reviews }` ✓

### Gate 2 FAIL — No tests for `updateIssue`; `listComments` since-filter untested

`updateIssue` (adapter.ts:77-96) is the most complex method in the adapter — it makes up to 4+ separate `gh` calls depending on the update shape — but `adapter.test.ts` has **zero tests** for it. `describe('GitHubAdapter')` in the test file has sections for every other method but no `describe('updateIssue')` block at all.

Additionally, `listComments` (adapter.ts:227-237) has a `since` timestamp filter branch (lines 233-235) that is exercised by zero tests — the only test calls `listComments(5)` with no `since` argument.

### Gate 3 FAIL — 0% branch coverage for `updateIssue`

`updateIssue` has five conditional branches (body, labels_add, labels_remove, state=closed, state=open). None are covered.

### Gate 4 — PASS

Prior Gate 4 finding (dynamic `import('node:child_process')` + silent DI bypass in `orchestrateCommandWithDeps`) resolved by removing the adapter threading code (deferred to "Up Next"). No dead code detected in changed files. Removed dist artifacts from tracking is appropriate cleanup.

### Gate 5 — FAIL (pre-existing regressions from d49686908, tracked as [qa/P1])

`npm run type-check` fails with 10 TypeScript errors; `npm test` has 22 top-level test failures (47 sub-test failures):
- `process-requests.test.ts` imports 6 now-deleted exports (`formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches`, `ChildBranchSyncDeps`)
- `orchestrate.test.ts` references `priority` field deleted from `EstimateResult`
- `process-requests.ts:385` has a type overlap error

These are already tracked as `[qa/P1]` items in TODO.md (filed 2026-03-28). No duplicate `[review]` tasks added.

### Gates 6-9 — Pass / N/A

- Gate 6: Internal TypeScript changes only — skip correct
- Gate 7: No UI changes
- Gate 8: No new dependencies
- Gate 9: No user-facing behavior changed

---

## Review — 2026-03-28 — commits 8e1208aaf..82ffc2a71 (build: updateIssue tests + export restoration)

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/process-requests.ts`

### Gate 1 — PASS

Interface alignment resolved in prior iteration; no spec-relevant changes in this build.

### Gate 2 — PASS (prior findings resolved)

`updateIssue` tests (`adapter.test.ts:91-155`) are concrete: 6 cases cover all 5 conditional branches with exact `calls.length` assertions and per-call arg checks. `listComments` since-filter tests (`adapter.test.ts:402-435`) test both partial-filter and all-old-comments cases with exact `comments.length` and `body` assertions. All 8 new tests pass.

### Gate 3 — PASS (prior findings resolved)

All branches of `updateIssue` covered. `listComments` since-filter branch covered.

### Gate 4 — PASS

Restored functions have no dead code. New `stat` and `rm` imports are used. No stray TODOs.

### Gate 5 — FAIL — TypeScript type error not fixed in process-requests.ts

`npm run type-check` fails with 4 errors. The current build resolved the export-restoration P1 but left one type error unfixed:

- `process-requests.ts(551,71)` — `issue.state !== 'review'` is an impossible comparison because `OrchestratorIssueState` has no `'review'` member. This error was present before (line 385) and shifted to 551 after the 168-line insertion. The `[qa/P1]` was marked `[x]` resolved based on test passage, but `tsc --noEmit` still fails.
- Pre-existing (not introduced by this build): `orchestrate.test.ts` 3 errors (`priority` field), tracked as qa/P1 for orchestrate.ts label enrichment. 46 test failures from same P1.

1 new `[review]` task written to TODO.md.

### Gates 6-10 — Pass / N/A

- Gate 6: Internal test additions + export restoration — no observable output; skip correct
- Gate 7: No UI changes
- Gate 8: No new dependencies
- Gate 9: No user-facing behavior changed
- Gate 10: All `[qa/P1]` bugs filed 2026-03-28 (< 3 iterations old)

---

## Review — 2026-03-28 — commits 5cd8c898b..8a2efa43b (build: review-state fix + label enrichment)

**Verdict: PASS** (2 observations)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`

### Gate 1 — PASS

Prior Gate 5 finding resolved: `'review'` added to `OrchestratorIssueState` union, eliminating TS2367 at `process-requests.ts:551`. Label enrichment fix restores `wave/${wave}` and `deriveComponentLabels` in `applyDecompositionPlan`.

### Gate 2 — PASS

Suite 395 ("applyDecompositionPlan label enrichment") subtests 1–4 all pass with concrete value assertions:
- `labels.includes('wave/1')` / `labels.includes('wave/2')` — not just shape checks
- Component label presence verified with exact string (`'component/orchestrator'`)
- Empty `file_hints` correctly produces no component labels

Subtests 5, 6, 8 fail (dependency body injection), but these are pre-existing tracked qa/P1 bugs, not new regressions.

### Gate 3 — PASS

The one-line `labels` change introduces two branches (`file_hints` present vs absent via `?? []`). Both are covered by subtests 2 and 4. `OrchestratorIssueState` union addition has no runtime branch to cover.

### Gate 4 — PASS

`deriveComponentLabels` import used, no dead code. No leftover TODOs or commented-out code in touched files.

### Gate 5 — PASS (prior finding resolved)

`tsc --noEmit`: 3 errors remain, all pre-existing qa/P1 (priority field in EstimateResult in test file). Zero errors in non-test sources. Test suite: 41 failures, all pre-existing. No new regressions introduced by this build.

Observation: Gate 5 finding from last review (TS2367 at process-requests.ts:551) confirmed fixed at `ffb36b37f`.

### Gates 6–10 — Pass / N/A

- Gate 6: Internal TypeScript type/label changes — skip correct
- Gate 7: No UI changes
- Gate 8: No new dependencies
- Gate 9: No user-facing behavior changed
- Gate 10: QA coverage 75% (12/16 features PASS); open P1 bugs filed 2026-03-28 (< 3 iterations old)

---

## Review — 2026-03-30 — commits 3f2287b93..fce7c6c30 (build: dep injection + label enrichment + adapter threading)

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`

### Gate 1 — PASS

- `applyDecompositionPlan`: appends "Depends on #X, #Y" to issue body when `depends_on` is non-empty; stores enriched body in state. Matches TODO and AC 6 intent. ✓
- `applyEstimateResults`: adds `complexity/<tier>` and `priority` labels via `execGh` after DoR passes, guarded by `deps.execGh && deps.repo`. ✓
- Adapter field threading (`adapter?` in all 5 deps interfaces + pass-through in `runTriageMonitorCycle`, `runOrchestratorScanPass`, `process-requests.ts`) is aligned with the incremental migration plan. ✓

### Gate 2 FAIL — Adapter instantiation branch untested

`process-requests.ts:941-943` — `const adapter = repo ? createAdapter(...) : undefined` is a two-branch conditional with zero test coverage:
- No test verifies adapter is created when `repo` is provided and flows into `scanDeps.adapter`, `prLifecycleDeps.adapter`, and `dispatchDeps.adapter`
- No test verifies adapter is `undefined` when `repo` is absent

This is the same class of finding as the first review (2026-03-27 Gate 2), which was closed as N/A when the code was removed. Code is back; finding re-opens.

Additionally: there are 302 lines of uncommitted adapter-migration changes in `orchestrate.ts` (working tree) marked as done in TODO. Every new `if (deps.adapter) ... else { execGh }` dual-path adds an untested adapter branch. These must be committed with tests before the next review.

### Gate 3 FAIL — 0% branch coverage for `repo ? createAdapter(...) : undefined`

Both branches of the conditional at `process-requests.ts:941-943` are uncovered.

### Gate 4 — PASS

- `createAdapter` and `OrchestratorAdapter` imports are used. No dead imports.
- `deps.execGh && deps.repo` guard before label call is correct — avoids passing `undefined` to execGh array.
- No dead code or leftover TODOs in changed files.

### Gate 5 — PASS

- `tsc --noEmit` passes with zero errors (first time in this session). ✓
- 1099/1134 tests pass; 34 failures all pre-existing (QA confirms: "exactly matches pre-regression baseline"). No new regressions. ✓
- `npm run build` clean. ✓

Observation: Gate 2 finding at `applyEstimateResults` (ok 396): test subtests 1–6 are concrete — exact `--add-label` value checks, combined-label verification, and no-label-when-absent assertions. Thorough.

### Gates 6–9 — Pass / N/A

- Gate 6: Internal TypeScript plumbing only; skip correct
- Gate 7: No UI changes
- Gate 8: No new dependencies
- Gate 9: No user-facing behavior changed

---
