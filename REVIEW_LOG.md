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
