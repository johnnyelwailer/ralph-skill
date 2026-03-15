# Project TODO

## Current Phase: Final Review Gates + Dashboard Polish + Pipeline Config

### In Progress (P0 — Blockers: TS Error + Coverage Gates)

- [x] [review] Gate 5: Fix duplicate `import path` in `orchestrate.test.ts` — line 3 and line 2408 both import `path from 'node:path'`, causing `tsc --noEmit` TS2300 error. Remove the duplicate at line 2408. (priority: critical)
- [x] [review] Gate 3: Raise `plan.ts` branch coverage from 40% to >=80% — add tests for error paths: `readLoopPlan` returning null on missing file, `mutateLoopPlan` throwing on missing plan, `writeQueueOverride` edge cases (no frontmatter, empty content). Uncovered branches at lines 14, 19-21, 47-49, 51. (priority: high)
- [ ] [review] Gate 3: Raise `requests.ts` branch coverage from 57.38% to >=80% — add tests for `handleSteerChild` child session lookup failure, `handleSpecBackfill` missing section/file error paths, and `handleDispatchChild`/`handleStopChild` spawn failure paths. (priority: high)

### Up Next (P1 — Dashboard UX + Test Infrastructure)

- [ ] [dashboard][high] Move per-provider health to dedicated left-pane sidebar tab — currently inline in header grid (App.tsx:385-389). Spec §6 requires sidebar tab. (priority: high)
- [ ] [dashboard][medium] Add session elapsed context (total iterations, avg duration) in header. Spec §6. (priority: medium)
- [ ] [dashboard][medium] Move sidebar expand/collapse toggle button to be vertically centered with header title row. Currently at top. Spec §6. (priority: medium)
- [ ] [dashboard][low] Add overflow ellipsis menu for docs panel when doc set is large. Spec §6. (priority: low)
- [ ] [dashboard][medium] Add `stuck_count` visibility to dashboard status/details. (priority: medium)
- [ ] [review] Gate 2: Fix broken E2E tests in `smoke.spec.ts` (selectors, placeholders, headings). (priority: high)
- [ ] [review] Gate 2: Extract and unit test dashboard logic (log parsing, state normalization, etc.). (priority: medium)
- [ ] [review] Gate 4: Remove copy-paste duplication in `dashboard.ts:247-264` — extract PID lookup into a helper. (priority: medium)
- [ ] [loop][medium] Update `loop_branch_coverage.tests.sh` to register and test `queue.override_success/failure/provider_fallback`, `requests.wait_drain/timeout`, and `invoke.opencode` paths. (priority: medium)

### Up Next (P2 — Pipeline Config + Orchestrator Prompt Templates + Provenance)

**Configurable pipeline:**
- [ ] [pipeline][high] Create `.aloop/pipeline.yml` schema and default config (plan → build × 3 → proof → review). (priority: high)
- [ ] [pipeline][high] Create `.aloop/agents/` directory with agent YAML definitions (plan.yml, build.yml, proof.yml, review.yml, steer.yml). (priority: high)
- [ ] [pipeline][high] Update `compile-loop-plan.ts` to read `.aloop/pipeline.yml`. (priority: high)

**Orchestrator prompt templates (prompt-based components):**
- [ ] [orchestrator][high] Create `PROMPT_orch_scan.md`, `PROMPT_orch_product_analyst.md`, `PROMPT_orch_arch_analyst.md`, `PROMPT_orch_decompose.md`, `PROMPT_orch_refine.md`, `PROMPT_orch_sub_decompose.md`, `PROMPT_orch_planner_*.md`, `PROMPT_orch_estimate.md`. (priority: high)

**Infinite loop prevention:**
- [ ] [runtime][high] Add provenance tagging — every agent commit includes `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers. (priority: high)

**GH integration polish:**
- [ ] [gh-workflows][medium] Add `aloop gh stop-watch` control path — current `stop` command stops individual issues but not the watch daemon. (priority: medium)

### Completed

- [x] [review] Gate 3: Verify `gh.ts` branch coverage is >=80% — verified at 81.59%.
- [x] [loop][critical] Add `queue/` folder check before cycle in both `loop.sh` and `loop.ps1`.
- [x] [loop][critical] Add requests/ wait loop in both `loop.sh` and `loop.ps1`.
- [x] [loop][high] Add opencode provider support to `loop.ps1`.
- [x] [loop][critical] Fix exit state parity: success → `exited`, interrupt/limit → `stopped`.
- [x] [loop][high] Fix `STUCK_COUNT` reset on successful iteration.
- [x] [bug][high] Fix CLI resume semantics for `aloop start <session-id> --launch resume`.
- [x] [runtime][high] Implement loop-plan.json compiler (`compile-loop-plan.ts`).
- [x] [runtime][high] Implement request processing for all 11 request types.
- [x] [runtime][high] Add runtime plan mutation + queue override writes.
- [x] [orchestrator][high] Implement orchestrator as `loop.sh` instance with triage monitor.
- [x] [orchestrator][high] Implement label-driven state machine, dispatch, monitor + gate + merge.
- [x] [orchestrator][high] Implement global spec gap analysis (triage classification in TS).
- [x] [orchestrator][high] Implement epic decomposition with wave assignment.
- [x] [gh-workflows][high] Implement `aloop gh start/watch/status/stop` commands.
- [x] [gh-workflows][high] Add `@aloop` mention detection and CI failure log ingestion.
- [x] [review] Gate 3: Raise `gh.ts` branch coverage to >=80%.
- [x] [review] Gate 3: Provide >=80% branch evidence for `loop.sh` and `loop.ps1`.
- [x] [review] Gate 5: Fix TypeScript error in `requests.ts:307` (UpdateIssueRequest.payload.title).
- [x] [review] Gate 5: Fix 6 dashboard test failures.
- [x] [review] Gate 3: Raise `requests.ts` branch coverage from 52.5% to >=80% (handler tests).
- [x] [review] Gate 6: Regenerate proof artifacts for iteration 11.
- [x] [review] Gate 2: Add test coverage for all 11 request types in `requests.test.ts`.
- [x] [review] Gate 1: Add `M/A/D/R` change type badges to commit detail view.
- [x] [review] Gate 3: Update `loop_branch_coverage.tests.sh` for queue/requests/opencode.
- [x] [review] Gate 3: Update `loop.tests.ps1` for queue/requests/opencode.
