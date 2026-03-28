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
