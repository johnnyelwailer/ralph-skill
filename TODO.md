# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Spec: SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern"

Acceptance criteria:
- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls
- [x] `orchestrate.ts` uses adapter interface (dual-path: adapter when available, execGh fallback)
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`)
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches (deferred per spec "Approach")
- [ ] All GitHub URL construction derives from adapter, never hardcoded (satisfied when meta.json config is done)

---

## Current Phase: Migration (final 2 tasks)

### Up Next

- [x] Migrate process-requests.ts execGh calls — one raw `execGh` call at line ~433 for refine-result body update: `execGh(['issue', 'edit', ..., '--body-file', bodyFile])`. Move adapter creation earlier (before the refine-result handler closure), then use `adapter.updateIssue(issue.number, { body: result.updated_body })` when adapter is available, falling back to raw `execGh` when not. Add test for the adapter path.

- [x] Meta.json adapter config — update `makeAdapterForRepo` in `process-requests.ts` to accept an optional `adapterType?: string` parameter (default `'github'`); read `meta.adapter` from the parsed meta object at line ~318 and pass it to `makeAdapterForRepo`; pass it through to `createAdapter({ type: adapterType, repo }, execGh)`. Add test asserting the type is forwarded. [reviewed: gates 1-9 pass]

### Deferred

- [ ] LocalAdapter implementation — file-based adapter storing issues as JSON in `.aloop/issues/`, PRs as branches; deferred per spec: "implement local adapter when there's demand"

### Completed

- [x] `OrchestratorAdapter` interface aligned with spec (positional params, correct return types)
- [x] `GitHubAdapter` implementation wrapping `gh` CLI calls
- [x] `adapter.test.ts` with unit tests for `GitHubAdapter`
- [x] Interface method names match spec: `listIssues`, `createPR`, `mergePR`, `getPRStatus`
- [x] `createIssue` returns `{ number, url }` per spec
- [x] `updateIssue` accepts `labels_add` / `labels_remove` per spec
- [x] `getPRStatus` returns `{ mergeable, ci_status, reviews }` per spec
- [x] adapter? field in all deps interfaces (TriageDeps, OrchestrateDeps, DispatchDeps, PrLifecycleDeps, ScanLoopDeps)
- [x] adapter instantiation in `process-requests.ts` — threaded through `scanDeps`, `prLifecycleDeps`, and `dispatchDeps`
- [x] Migrate issue lifecycle calls in orchestrate.ts (triage/spec-question functions) — dual-path adapter branches
- [x] Migrate PR lifecycle calls in orchestrate.ts — `mergePr()`, `processPrLifecycle()` review feedback, `flagForHuman()`, `createTrunkToMainPr()`, `createPrForChild()`
- [x] Migrate scanLoop / bulk-fetch execGh calls — `fetchAndApplyBulkIssueState` uses adapter when available
- [x] [review] Gate 2/3: `makeAdapterForRepo` extracted and tested; branch coverage for repo present/absent
- [x] [review] Adapter-branch tests for orchestrate.ts dual-path functions: `applyTriageResultsToIssue`, `resolveSpecQuestionIssues`, `mergePr`, `flagForHuman`, `processPrLifecycle`
- [x] Fix: `resolveSpecQuestionIssues` call passed `adapter: deps.adapter` so adapter branch is reachable in production
- [x] [qa/P1] applyDecompositionPlan dependency body injection fix
- [x] [qa/P1] applyEstimateResults complexity/priority labels fix
- [x] [qa/P1] process-requests.ts missing exported functions restored
