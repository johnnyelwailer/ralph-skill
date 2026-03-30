# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

### Up Next

- [x] **Fix P2 bug: `GitHubAdapter.updateIssue` unconditionally calls `execGh` with no edit flags** — `adapter.ts:84` runs `await this.execGh(args)` even when `update.body` is undefined and `args` has no edit flags beyond the 4-element base `['issue', 'edit', N, '--repo', repo]`. `gh issue edit` requires at least one flag, so all 7 label-only call-sites fail at runtime (orchestrate.ts:1888, 1901, 2266, 2286, 2306, 2505, 3814). Fix: guard the base call — only invoke it when `update.body` is defined (i.e. when body flag was pushed onto `args`). **Also fix existing tests:** `adapter.test.ts:105` (`labels_add` test) asserts `calls.length === 3` (base + 2 labels) and `adapter.test.ts:118` (`labels_remove` test) asserts `calls.length === 2` (base + 1 label) — both include the spurious base call and must be updated to reflect the correct post-fix behavior (2 and 1 respectively). Add a new test verifying no base call is made for label-only updates.

### Completed

<!-- spec-review: PASS — all in-scope requirements for issue #177 verified 2026-03-30. OrchestratorAdapter interface defined (adapter.ts); GitHubAdapter implements all methods; all core GH CRUD call-sites in orchestrate.ts and process-requests.ts migrated to adapter-with-fallback pattern; adapter-path tests cover all migrated call-sites in both files (process-requests.test.ts 11/11 pass; orchestrate.test.ts adapter-path suites all pass). Remaining spawnSync('gh',...) calls (Project V2 GraphQL sync, PR comment context fetch) are out of scope — not in the adapter interface contract and not targeted by issue #177. No spec violations found. -->

<!-- spec-review: PASS (re-verify 2026-03-30, triggered by docs change 39600c28a README fix) — README docs change has no impact on adapter migration compliance. All 14 ACs re-verified: deps interfaces have adapter? fields (OrchestrateDeps:209, TriageDeps:196, ScanLoopDeps:4747, PrLifecycleDeps:3513, DispatchDeps:234); applyDecompositionPlan uses adapter.createIssue() with fallback (orchestrate.ts:676-680); checkPrGates uses adapter.getPRStatus()+getPrChecks() (orchestrate.ts:3546,3576); mergePr uses adapter.mergePR() (orchestrate.ts:3694); process-requests.ts uses adapter.createPR()/getIssue()/updateIssue() for all in-scope CRUD; createGhIssue() fallback is intentional backward-compat path (spec constraint); 11+ adapter-path test suites in orchestrate.test.ts. No new violations. Prior PASS stands. -->

<!-- spec-gap analysis (2026-03-30 run 2): one new P2 gap found — see item below. Previous P3 cosmetic gap remains [x]. -->

- [ ] [spec-gap] **P2 — `GitHubAdapter.updateIssue` unconditionally calls `execGh` with no edit flags when only labels are updated** — `adapter.ts:84` always runs `await this.execGh(['issue', 'edit', N, '--repo', repo])` before the `labels_add`/`labels_remove` blocks, even when `update.body` is undefined. Running `gh issue edit N --repo owner/repo` with zero edit flags is a CLI error ("at least one flag required"). This means all 7 label-only `adapter.updateIssue()` call-sites migrated by issue #177 fail at runtime: `orchestrate.ts:1888`, `1901`, `2266`, `2286`, `2306`, `2505`, `3814`. Tests pass because they inject a mock `execGh` that doesn't validate flag presence. The bug predates issue #177 but became a production-breaking risk when the migration replaced direct `execGh(['issue', 'edit', '--add-label'])` calls with `adapter.updateIssue({ labels_add: ... })`. Fix: add a guard in `GitHubAdapter.updateIssue` — only call `await this.execGh(args)` when `args.length > 4` (i.e., when at least one edit flag is present), or restructure to skip the base call when `body` is absent. TASK_SPEC permits adapter.ts modifications for genuine bugs. P2 (runtime failures for label operations in production).

<!-- spec-gap analysis: no P1/P2 gaps found — spec fully fulfilled for issue #177 (OrchestratorAdapter migration). One P3 cosmetic gap noted below (pre-existing, does not block completion). -->

- [x] [spec-gap] **P3 — Stale pipeline description in SPEC.md summary and Proof AC** — `SPEC.md:5` still says "default pipeline is `plan → build × 5 → proof → qa → review`" (predates finalizer architecture). `SPEC.md:716-717` and `SPEC.md:775` acceptance criteria say "Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)" — also predates finalizer. Authoritative source is `SPEC.md:400-409` which correctly states: continuous cycle is `plan → build × 5 → qa → review` (8-step); proof runs only in finalizer. Code is correct per lines 400-409. Fix: update SPEC.md:5 and the Proof/QA AC sections to match lines 400-409. P3 (cosmetic — no runtime impact, code is correct). Does NOT block completion.

- [x] **Migrate orchestrate.ts — applyEstimateResults label ops and spec-question issue creation** — Migrated two remaining call-sites in `applyEstimateResults`: (1) label ops use `adapter.updateIssue({ labels_add: [...] })` with fallback to `execGh`; (2) spec-question issue creation uses `adapter.createIssue()` with fallback to `execGhIssueCreate`. Added `adapter?: OrchestratorAdapter` to deps type. Passes `adapter: deps.adapter` at call site in `runOrchestrateCycle`. Added 4 adapter-path tests in `applyEstimateResults adapter path` describe block. Build passes; no test regressions. [reviewed: gates 1-9 pass]

- [x] [review] **Gate 2/Gate 3: Add adapter-path tests for process-requests.ts changes** — `ecad85f99` migrated four call-sites to the adapter but added zero tests: (1) `adapter.createIssue()` in sub-decomposition at line 419, (2) `adapter.createIssue()` in Phase 2 at line ~542, (3) `adapter.createPR()` in Phase 2c at line ~659, (4) `updateParentTasklist()` refactored to use `adapter.getIssue()` + `adapter.updateIssue()` at lines 1149-1163. All four adapter-guarded branches have 0% coverage. Add tests following the `makeAdapterForRepo` test pattern: inject a mock adapter, exercise the path, assert exact adapter call args. (priority: high) [reviewed: gates 1-10 pass]

- [x] **Migrate orchestrate.ts — checkPrGates** — Migrated `checkPrGates` to use adapter-with-fallback pattern. Gate 1 uses `adapter.getPRStatus()` for mergeability check. Gate 2 uses `adapter.getPrChecks()` for CI check details. Added `getPrChecks` to `OrchestratorAdapter` interface. Added 5 adapter-path tests. [reviewed: gates 1-10 pass]

- [x] **Add adapter-path tests for checkPrGates** — Added 5 tests in `checkPrGates adapter path` describe block: (1) adapter.getPRStatus/getPrChecks called, (2) not-mergeable returns fail, (3) pending checks returns pending, (4) failed checks returns fail with names, (5) fallback to execGh when no adapter.

- [x] [review] **Gate 2/Gate 5: Fix broken runTriageMonitorCycle adapter tests** — `createMockAdapter({ listComments: ... })` spreads the override into `base` after `calls.push(...)` tracking is wired, so the override replaces the tracked implementation and `calls` never records `listComments` calls. Tests at `orchestrate.test.ts:1614-1616` and `1651-1654` always see `listCalls.length === 0`. Fix: wrap each override in a closure that pushes to `calls` first then delegates to the override (for all overridable methods), rather than spreading overrides raw. The two failing tests are the only regressions vs the 34-failure baseline (now 36). (priority: high)

- [x] [review] **Gate 4: Remove execGhForTriage DI bypass in runTriageMonitorCycle** — Removed inline `spawnSync('gh', ...)` fallback at `orchestrate.ts:2120-2125`. Made `TriageDeps.execGh` optional. When adapter is present and `execGh` is absent, `undefined` is passed through instead of spawning real `gh` CLI. All adapter-path `deps.execGh` calls in `applyTriageResultsToIssue` are already guarded behind `if (deps.adapter)` checks.

- [x] **Migrate process-requests.ts GH calls to adapter** — Replaced all `spawnSync('gh', ...)` for issue/PR CRUD with adapter calls:
  - Phase 1c body update → `adapter.updateIssue()` (line 135)
  - Sub-decomposition issue creation → `adapter.createIssue()` (line 419)
  - Phase 2 issue creation → `adapter.createIssue()` (line 544)
  - Phase 2c PR creation → `adapter.createPR()` (line 663)
  - `updateParentTasklist()` → `adapter.getIssue()` + `adapter.updateIssue()` (lines 1156-1160)
  - `makeAdapterForRepo` reads `meta.adapter` from `meta.json` for adapter type selection (line 354)

- [x] **Migrate orchestrate.ts — applyDecompositionPlan, triageMonitoringCycle, mergePr, flagForHuman, label ops** — Migrated:
  - `applyDecompositionPlan`: `deps.execGhIssueCreate` → `deps.adapter.createIssue()` with fallback
  - `runTriageMonitorCycle`: `execGh(['issue-comments', ...])` → `adapter.listComments()` with fallback
  - `mergePr`: `execGh(['pr', 'merge', ...])` → `deps.adapter.mergePR()` with fallback
  - `createTrunkToMainPr`: `execGh(['pr', 'create', ...])` → `deps.adapter.createPR()` with fallback
  - `flagForHuman`: label/comment ops → adapter pattern with fallback
  - `applyTriageResultsToIssue`: all label ops → adapter pattern with fallback
  - Spec question resolution label ops → adapter pattern with fallback
  - Adapter-path tests added for `applyDecompositionPlan`, `runTriageMonitorCycle`, `mergePr`, `processPrLifecycle`
