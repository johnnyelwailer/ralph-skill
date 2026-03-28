# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Spec: SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern"

Acceptance criteria:
- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls
- [ ] `orchestrate.ts` uses adapter interface, not raw `execGh`
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`)
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches (deferred per spec "Approach")
- [ ] All GitHub URL construction derives from adapter, never hardcoded (satisfied when #3 is done)

---

## Current Phase: Migration

### QA Bugs

- [ ] [qa/P1] QA environment Bash tool non-functional: All shell commands return exit code 1 or 134 with no output → TypeScript build, unit test suite, and CLI binary install could not be executed → QA of compiled artifacts is blocked until env is fixed. Tested at 2026-03-27. (priority: high)

### In Progress

- [x] [review] Gate 1: `OrchestratorAdapter` interface in `adapter.ts` deviates from spec's method names and return types — `queryIssues` must be renamed to `listIssues` (spec line ~988); `createPr`/`mergePr`/`getPrStatus` must be `createPR`/`mergePR`/`getPRStatus` (spec convention); `createIssue` must return `{ number: number; url: string }` not bare `number` (spec line ~983); `getPRStatus` must return `{ mergeable, ci_status: 'success'|'failure'|'pending', reviews: Array<{ verdict: string }> }` not `{ mergeable, mergeStateStatus }` (spec line ~997); `updateIssue` must accept `labels_add` and `labels_remove` fields (spec line ~985) — fix the interface and implementation in `src/lib/adapter.ts` and update all call sites and tests accordingly (priority: high)

- [x] [review] Gate 2: ~~No tests for adapter instantiation branches~~ — adapter instantiation code removed pending re-implementation; gate no longer applicable

- [x] [review] Gate 4: ~~execGh fallback breaks DI~~ — adapter instantiation code removed pending re-implementation; gate no longer applicable

### Up Next

- [ ] Re-add adapter field to deps interfaces (`TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps`) and thread `deps.adapter` through child deps in `orchestrateCommandWithDeps`

- [ ] Re-add adapter instantiation in `orchestrateCommandWithDeps` — create adapter when `filterRepo` is provided, using static import of `node:child_process` and requiring `deps.execGh` (no silent fallback)

- [ ] Migrate issue lifecycle calls in orchestrate.ts (TriageDeps / triage functions) — replace `deps.execGh(['issue', ...])` with `adapter.closeIssue()`, `adapter.addLabels()`, `adapter.removeLabels()`, `adapter.postComment()`, `adapter.listIssues()`, and `adapter.updateIssue()` in triage functions; replace `deps.execGhIssueCreate` with `adapter.createIssue()` in dispatch

- [ ] Migrate PR lifecycle calls in orchestrate.ts (PrLifecycleDeps) — replace `deps.execGh` calls in PR creation/merge/status functions with `adapter.createPR()`, `adapter.mergePR()`, `adapter.getPRStatus()`

- [ ] Migrate scanLoop / bulk fetch execGh calls in orchestrate.ts — replace `deps.execGh` calls in bulk fetch, issue close, and auto-merge with adapter calls

- [ ] Migrate process-requests.ts execGh calls — replace `execGh` usage with adapter calls; thread adapter through deps

- [ ] Meta.json adapter config — read `adapter` field from `meta.json` (default: `"github"`) and pass the type to `createAdapter()` instead of hardcoding `"github"`

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
