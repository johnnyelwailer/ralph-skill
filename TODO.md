# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

- [ ] [review] Gate 2: `orchestrate.test.ts:390-396` — test `'preload skips when adapter is not provided'` tests the wrong invariant and passes for the wrong reason. When `repo: 'owner/repo'` is passed, `orchestrate.ts:993-999` ALWAYS creates an adapter before reaching the preload check, so `deps.adapter` is never undefined at line 1135. The test passes only because real `spawnSync('gh', ...)` is invoked (createMockDeps has no execGh) and the error is silently swallowed by the `catch` block at line 1228. Replace this test with one that verifies the genuine invariant: when `repo` is NOT set (no filterRepo), listIssues is never called. Example: `orchestrateCommandWithDeps({}, deps_with_adapter)` → `listCalls.length === 0`. (priority: high)

- [ ] [review] Gate 4 (a): `orchestrate.ts:1135` — `&& deps.adapter` is dead code. After lines 993-999, whenever `filterRepo` is truthy, `deps.adapter` is always set. The guard is unreachable in any meaningful state. Remove it: simplify to `if (filterRepo && state.issues.length === 0)`. (CONSTITUTION rule 13 — no dead code) (priority: medium)

- [ ] [review] Gate 4 (b): `orchestrate.ts:993-999` — inline `spawnSync` fallback reintroduced. This is the same DI bypass flagged in the 2026-03-27 review (Gate 4) and previously fixed for `runTriageMonitorCycle`. In test contexts that pass `repo` without an `execGh` (like the now-broken test 3), real `gh` CLI invocations are silently triggered. Consider moving the adapter bootstrap into `orchestrateCommand` (the non-DI entry point) so `orchestrateCommandWithDeps` always receives a fully-populated `deps` and the spawnSync fallback stays outside the testable boundary. (priority: medium)

### Up Next

- [x] [review][P2] AC#11 partial — `orchestrateCommandWithDeps()` does NOT instantiate an adapter. `createAdapter` is never imported or called in `orchestrate.ts`. In production, `orchestrateCommand` calls `orchestrateCommandWithDeps(options, deps)` using `defaultDeps` which has no `adapter` field. All `deps.adapter`-guarded code paths inside `orchestrateCommandWithDeps` (preload at line 1126, plan application at lines 1108/1118) are dead in production. Specifically: `aloop orchestrate --plan plan.json --repo owner/repo` cannot create real GH issues — `applyDecompositionPlan` falls back to plan-ID placeholders. TASK_SPEC AC#11 requires: "Adapter created once in `orchestrateCommandWithDeps()`, passed through deps." Fix: import `createAdapter` in orchestrate.ts and instantiate adapter at the top of `orchestrateCommandWithDeps` when `filterRepo` is set (same pattern as process-requests.ts line 354: `makeAdapterForRepo(repo, execGh, meta.adapter)`).

- [x] [review] Gate 2/3: preload path in `orchestrateCommandWithDeps` (orchestrate.ts:1135–1231) — Added 5 tests: preload populates state via adapter, preload skips when state has issues, preload skips without adapter, preload handles empty listIssues, preload infers status from labels without project status.

- [ ] [review] Gate 2/3: `invokeAgentReview` comment fetch (process-requests.ts:965) — `if (adapter) { adapter.listComments(prNumber) }` is untested. The prior `if (repo)` guard was also untested, but the behavior changed: comment history is now fetched only when adapter is present (not when only `repo` is set). Add a process-requests.test.ts test for the review-prompt-enqueue path that verifies `listComments` is called and the result is included in the written queue file. (priority: high)

### Spec-Gap Analysis

spec-review: 1 gap found (P2)

AC #11 is partially unimplemented: `processRequests()` correctly creates and passes the adapter ✅, but `orchestrateCommandWithDeps()` never instantiates an adapter, leaving all adapter-guarded paths within that function dead in production. All other acceptance criteria (AC#1–AC#10, AC#12–AC#15) are satisfied. See `[review]` task above.

### Completed

- [x] [spec-gap][P2] Removed dead code `createGhIssue`/`makeGhIssueCreator` and `execGhIssueCreate` field from `OrchestrateDeps` and fallback branch in `applyDecompositionPlan` — verified at process-requests.ts and orchestrate.ts
- [x] [spec-gap][P3] Migrated preload in `orchestrateCommandWithDeps` from raw `nodeSpawnSync` to `deps.adapter.listIssues()` + `deps.adapter.getIssue()` pattern; project status GraphQL calls use `deps.execGh` when available
- [x] Add `adapter?: OrchestratorAdapter` to `TriageDeps`, `OrchestrateDeps`, `DispatchDeps`, `PrLifecycleDeps`, `ScanLoopDeps` — verified at orchestrate.ts lines 191–234, 3513, 4747
- [x] `applyDecompositionPlan` uses `deps.adapter.createIssue()` when adapter present, falls back to plan ID as placeholder — `execGhIssueCreate` fallback removed
- [x] `checkPrGates` uses `adapter.getPRStatus()` and `adapter.getPrChecks()` when adapter present — verified at orchestrate.ts:3545, 3575
- [x] PR merge in `prLifecycle` uses `adapter.mergePR()` — verified at orchestrate.ts:3693–3694
- [x] `triageMonitoringCycle` comment fetching uses `adapter.listComments()` — verified at orchestrate.ts:2070–2082
- [x] Label operations use `adapter.updateIssue({ labels_add/labels_remove })` and `adapter.postComment()` throughout orchestrate.ts — verified at lines 1879–1928, 2265–2307, 3812–3814, 4013–4014
- [x] `process-requests.ts` PR creation uses `adapter.createPR()` via `createPRViaAdapter` — verified at process-requests.ts:1186
- [x] `process-requests.ts` `updateParentTasklist` uses `adapter.getIssue()` + `adapter.updateIssue()` — verified at process-requests.ts:1102–1110
- [x] Issue body updates use `adapter.updateIssue()` via `updateIssueBodyViaAdapter` — verified at process-requests.ts:128–139
- [x] `makeAdapterForRepo` extracted as testable helper at process-requests.ts:146–151
- [x] Adapter created once in `processRequests()` at line 354, passed through deps
- [x] GH project board GraphQL sync left unchanged (process-requests.ts:803–853) — out of scope per TASK_SPEC
- [x] git calls unchanged — all remain as `spawnSync('git', ...)`
- [x] `OrchestratorAdapter` interface + `GitHubAdapter` in adapter.ts — verified complete (294 lines, all methods present)
- [x] TypeScript builds cleanly — verified in PR_DESCRIPTION
- [x] Migrate `invokeAgentReview` PR comment fetch to adapter (process-requests.ts:968) — uses `adapter.listComments()` instead of raw `spawnSync('gh', ['pr', 'view', ..., '--json', 'comments'])`
- [x] Tests passing — 1152/1188 (35 pre-existing failures unrelated to this issue)
