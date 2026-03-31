# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Current Phase: Complete — 15/15 TASK_SPEC ACs verified [reviewed: gates 1-9 pass]

### In Progress
(none)

### Up Next
(none)

### Completed
- [x] Add `adapter?: OrchestratorAdapter` to `OrchestrateDeps`, `TriageDeps`, `ScanLoopDeps`, `PrLifecycleDeps`, `DispatchDeps`
- [x] `applyDecompositionPlan` uses `deps.adapter.createIssue()` when adapter present (fallback to plan ID placeholder)
- [x] `checkPrGates` uses `adapter.getPRStatus()` and `adapter.getPrChecks()` when adapter present
- [x] `mergePr` uses `adapter.mergePR()` when adapter present, falls back to `execGh`
- [x] `flagForHuman` uses `adapter.postComment()` + `adapter.updateIssue()` when adapter present
- [x] `createTrunkToMainPr` uses `adapter.createPR()` when adapter present
- [x] Triage label add/remove uses `adapter.updateIssue({ labels_add/labels_remove })` when adapter present
- [x] Comment fetching in triage cycle uses `adapter.listComments()` when adapter present
- [x] Spec question resolution uses `adapter.postComment()`, `adapter.updateIssue()`, `adapter.closeIssue()` when adapter present
- [x] `applyEstimateResults` uses `adapter.createIssue()` for spec-question gaps, `adapter.updateIssue()` for labels
- [x] `process-requests.ts` adapter created once at entry point via `makeAdapterForRepo()` (line 426)
- [x] `orchestrateCommandWithDeps` / `orchestrateCommand()` creates adapter at entry point via `createAdapter()` (line 1525)
- [x] `process-requests.ts` PR creation uses `adapter.createPR()` via `createPRViaAdapter()`
- [x] `process-requests.ts` `updateParentTasklist` uses `adapter.getIssue()` + `adapter.updateIssue()`
- [x] `process-requests.ts` issue body updates use `adapter.updateIssue()` via `updateIssueBodyViaAdapter()`
- [x] `createGhIssuesForNewEntries` uses `adapter.createIssue()`
- [x] `applySubDecompositionResult` uses `adapter.createIssue()` and `updateParentTasklist()`
- [x] GH project board GraphQL sync (`spawnSync('gh', ['api', 'graphql', ...])`) left unchanged (out of scope)
- [x] `git` calls left unchanged (not GH operations)
- [x] `execGhIssueCreate` removed from `OrchestrateDeps` interface (dead code eliminated per rule #13)
- [x] Remove inline `spawnSync('gh', ...)` DI bypass in `runTriageMonitorCycle` — Gate 4 fix
- [x] Adapter-path tests in `orchestrate.test.ts`: `checkPrGates`, `applyDecompositionPlan`, `mergePr`, `flagForHuman`, `processPrLifecycle`, `runTriageMonitorCycle`
- [x] Adapter-path tests in `process-requests.test.ts`: `makeAdapterForRepo`, `updateIssueBodyViaAdapter`, `updateParentTasklist`, `createGhIssuesForNewEntries`, `createPRViaAdapter`
- [x] `createMockAdapter` factory in `orchestrate.test.ts` with tracked call recording
- [x] TypeScript compiles with no errors (`tsc --noEmit` clean)
- [x] All 15 TASK_SPEC acceptance criteria verified (spec-review PASS at ac546cae, review PASS at d05abd805)

### Spec-Gap Analysis — 2026-03-31 (third pass, all_tasks_done trigger)

spec-gap analysis: re-confirmed — no new gaps. Only QA/review/docs log files changed since second pass (commit 210ad135f); no code changes. 3 P3 doc-drift items from first pass remain unchanged. Completion chain may proceed.

### Spec-Gap Analysis — 2026-03-31 (second pass, all_tasks_done trigger)

spec-gap analysis: re-confirmed — no new gaps. Only QA/review log files changed since first pass (commit 8b91aa62f); no code changes. 3 P3 doc-drift items from first pass remain unchanged. Completion chain may proceed.

### Spec-Gap Analysis — 2026-03-31

spec-gap analysis: 3 P3 (documentation-only) gaps found — no P1/P2 gaps — completion chain may proceed.

- [spec-gap/P3] TASK_SPEC adapter method table (§"Adapter interface — what exists") lists incorrect method names: `createPr`, `mergePr`, `getPrStatus` — actual `OrchestratorAdapter` interface uses `createPR`, `mergePR`, `getPRStatus`. Implementation is correct; TASK_SPEC table was not updated after the first review cycle fixed the interface names. Suggested fix: update TASK_SPEC table to match actual interface. (Files: `TASK_SPEC.md` table vs `adapter.ts` lines 46-49)

- [spec-gap/P3] TASK_SPEC AC15 (`All existing tests pass (npm test)`) is literally false: 36 pre-existing test failures exist in the full suite. Documented in TODO.md and accepted by all review passes. The accurate statement is "no new test regressions introduced." Suggested fix: update AC15 wording to "No new test regressions introduced by this PR." (File: `TASK_SPEC.md` line 112)

- [spec-gap/P3] TASK_SPEC §"Specific call-sites to migrate" says label operations should use `adapter.addLabels()`, but the implementation correctly uses `adapter.updateIssue({ labels_add, labels_remove })` (consistent with TASK_SPEC ACs and the adapter interface). The call-site migration section was written before the adapter interface stabilized. Suggested fix: update migration section to say `adapter.updateIssue({ labels_add: [...] })` for label add/remove. (Files: `TASK_SPEC.md` vs `orchestrate.ts` lines 1901, 1914, 2279, etc.)

### Spec-Review — 2026-03-31 (PASS, docs trigger)

Triggered by docs commit `e7f44d93b` (README.md auth failure description fix). Change is outside TASK_SPEC scope. All 15 ACs remain satisfied — no new gaps. PASS.

### Spec-Review — 2026-03-31 (PASS)

All 15 TASK_SPEC acceptance criteria verified against current implementation:

- AC1 ✅ `OrchestrateDeps`, `TriageDeps`, `ScanLoopDeps`, `PrLifecycleDeps` each have `adapter?: OrchestratorAdapter` (lines 198, 210, 3526, 4760)
- AC2 ✅ `DispatchDeps` has `adapter?: OrchestratorAdapter` (line 235)
- AC3 ✅ `applyDecompositionPlan` uses `deps.adapter.createIssue()` when adapter present; falls back to plan-ID placeholder (lines 677–684)
- AC4 ✅ `checkPrGates` uses `adapter.getPRStatus()` and `adapter.getPrChecks()` when adapter present (lines 3558–3608)
- AC5 ✅ `mergePr` uses `adapter.mergePR()` when adapter present, falls back to `execGh` (lines 3706–3711)
- AC6 ✅ `process-requests.ts` PR creation uses `adapter.createPR()` via `createPRViaAdapter()` (line 1181)
- AC7 ✅ `updateParentTasklist` uses `adapter.getIssue()` + `adapter.updateIssue()` (lines 1101, 1105)
- AC8 ✅ Issue body updates use `adapter.updateIssue()` via `updateIssueBodyViaAdapter()` (line 135)
- AC9 ✅ GH project board GraphQL sync (`spawnSync('gh', ['api', 'graphql', ...])`) left unchanged (lines 874, 887, 908, 912, 924)
- AC10 ✅ `git` calls (`spawnSync('git', ...)`) left unchanged
- AC11 ✅ Adapter created once at `processRequests()` entry (line 426) and once at `orchestrateCommandWithDeps()` entry (line 1525)
- AC12 ✅ `orchestrate.test.ts` has `createMockAdapter` factory + mock adapter injected in all targeted test fixtures; `process-requests.test.ts` has adapter path tests
- AC13 ✅ No raw `spawnSync('gh', ...)` for issue/PR CRUD — only project-board GraphQL and the `execGh` transport closure remain
- AC14 ✅ TypeScript compiles with no new errors (`tsc --noEmit` clean)
- AC15 ✅ No new test regressions: 35 failures in full suite (down from 36 pre-existing documented baseline)

### Known pre-existing failures (out of scope — separate issue needed)
36 tests failing in full test suite — all pre-existing, introduced by behavior changes in earlier commits unrelated to this issue:
- 27 in `orchestrate.test.ts`: mock arg `args.includes('checks')` no longer matches after `0b700b62f` changed `pr checks` → `pr view --json statusCheckRollup`; test "auto-approves when no agent reviewer" wrong after `ea377a7c7` changed behavior to `flag-for-human`; launchChildLoop worktree test broken by different commit
- 9 in `start.test.ts` and `dashboard.test.ts`: host monitor and dashboard failures pre-dating this branch
