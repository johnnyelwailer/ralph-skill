# Project TODO

## Current Phase: Loop Script Completion + Orchestrator Implementation

### In Progress (P0 — Loop Script Completion & Review Gates)
- [x] [loop][critical] Add `queue/` folder check before cycle — if `queue/` has `.md` files, pick first (sorted), parse frontmatter, run it, delete after completion; do NOT advance `cyclePosition` for queue items. Must implement in both `loop.sh` and `loop.ps1`. (priority: critical)
- [x] [loop][critical] Add requests/ wait loop — after agent completes, if requests/*.json exist, poll until directory empties or timeout (default 300s). Must implement in both loop.sh and loop.ps1. (priority: critical)
- [x] [loop][high] Add opencode provider support to loop.ps1 (already done in loop.sh). (priority: high)
- [x] [review] Gate 3: Raise `gh.ts` branch coverage from 63.32% to >=80% (priority: medium)
- [x] [review] Gate 3: Provide >=80% branch evidence for `loop.sh` and `loop.ps1` — cycle resolution + frontmatter paths (priority: medium)
- [x] [bug][high] Fix CLI resume semantics — `aloop start <session-id> --launch resume` now reuses existing session/worktree/branch. (priority: high)
- [x] [review] Gate 3: Update `loop_branch_coverage.tests.sh` to register and test `queue/` override, `requests/` wait-loop, and `opencode` provider paths in `loop.sh` (priority: high)
- [x] [review] Gate 3: Update `loop.tests.ps1` to register and test `queue/` override, `requests/` wait-loop, and `opencode` provider paths in `loop.ps1` (priority: high)

- [x] [review] Gate 6: Regenerate proof artifacts or correct manifest paths so iteration 11 is verifiable (missing: gh-test-output.txt, derive-mode-test.txt, etc.) (priority: medium)
- [x] [loop][critical] Fix exit state parity: success → `exited`, interrupt/limit → `stopped` in both `loop.sh` and `loop.ps1`. (priority: critical)
- [x] [loop][high] Fix `STUCK_COUNT` reset: reset to 0 on every successful build iteration in `loop.sh` (already correct in `loop.ps1`?). (priority: high)
- [x] [review] Gate 5: Fix TypeScript error in requests.ts:307 — `request.payload.title` accessed but `UpdateIssueRequest.payload` has no `title` field. Either add `title?: string` to the interface or remove the dead code branch. (priority: high)
- [x] [review] Gate 5: Fix 6 dashboard test failures — `processGhConventionRequests` was refactored to delegate to `processAgentRequests` (writes to `queue/` instead of `responses/`), but dashboard tests at dashboard.test.ts:16-21 still check for `.aloop/responses/` files. Update tests for new response path or update test expectations. (priority: high)
- [x] [review] Gate 3: Raise `requests.ts` branch coverage from 52.5% to >=80% — add tests for `handleUpdateIssue`, `handleDispatchChild`, `handleStopChild`, `handleQueryIssues`, `handleCreatePr`, `handleMergePr` and error paths in `handleCreateIssues`, `handleCloseIssue`, `handlePostComment`, `handleSpecBackfill`. (priority: high)
- [ ] [review] Gate 3: Raise `plan.ts` branch coverage from 35.71% to >=80% — add tests for error paths: `readLoopPlan` returning null on missing file, `mutateLoopPlan` throwing on missing plan, `writeQueueOverride` edge cases (no frontmatter, empty content). (priority: high)
- [x] [review] Gate 2: Add test coverage for missing request types in requests.test.ts — currently only tests create_issues, close_issue, post_comment, spec_backfill, steer_child. Missing: update_issue, create_pr, merge_pr, dispatch_child, stop_child, query_issues. (priority: medium) [reviewed: Gate 2 pass — all 11 types covered]
- [ ] [review] Gate 1: Add `stuck_count` visibility to Dashboard status/details (priority: medium)
- [ ] [review] Gate 1: Add "overflow extra docs into an end-of-row menu" for DocsPanel (priority: low)
- [x] [review] Gate 1: Add `M/A/D/R` change type badges to Commit detail view (priority: low) [reviewed: Gate 1 pass — App.tsx:840-842 renders M/A/D/R with color coding]
- [ ] [review] Gate 2: Fix broken E2E tests in `smoke.spec.ts` (selectors, placeholders, headings) (priority: high)
- [ ] [review] Gate 2: Extract and unit test dashboard logic (log parsing, state normalization, etc.) (priority: medium)
- [ ] [review] Gate 4: Refactor `requests.ts` to use `ghCommandRunner` in ALL handlers (inconsistent `spawnSync` usage) (priority: low)
- [ ] [review] Gate 5: Fix duplicate `import path` in `orchestrate.test.ts` — line 3 and line 2408 both import `path from 'node:path'`, causing `tsc --noEmit` TS2300 error. Remove the duplicate at line 2408. (priority: high)
- [ ] [review] Gate 3: Raise `requests.ts` branch coverage from 55.93% to >=80% — uncovered branches at lines 220-229, 266, 385-386, 413-427, 453-454, 505-506. Add tests for `handleSteerChild` child session lookup failure, `handleSpecBackfill` missing section/file error paths, and `handleDispatchChild`/`handleStopChild` spawn failure paths. (priority: high)
- [ ] [review] Gate 4: Remove copy-paste duplication in `dashboard.ts:247-264` — the active.json PID lookup block (lines 248-255) is identical to lines 257-264. Extract into a helper or combine the `if`/`else if` branches. (priority: medium)

### Up Next (P1 — Orchestrator + Runtime + GH Integration)

**Runtime (aloop CLI, TS/Bun):**
- [x] [runtime][high] Implement loop-plan.json compiler — compile cycle prompt filenames from session config, generate prompt files with frontmatter during session setup. (priority: high) [reviewed: Gate 1 pass, Gate 2 pass, Gate 3 pass — 85.71% branch]
- [x] [runtime][high] Implement request processing — watch `requests/*.json`, validate against contract, execute side effects, delete requests, queue follow-up prompts into `queue/`. Handle all 11 request types. (priority: high) [reviewed: Gate 1 pass, Gate 5 FAIL — TS error + test regressions]
- [x] [runtime][high] Add runtime plan mutation — rewrite `loop-plan.json` on permanent changes, write queue entries for one-shot overrides. (priority: high) [reviewed: Gate 1 pass, Gate 3 FAIL — 40% branch coverage]

**Orchestrator (loop.sh instance with orchestrator prompts):**
- [x] [orchestrator][high] Implement orchestrator as a `loop.sh` instance — single `PROMPT_orch_scan.md` cycle (heartbeat), primarily queue-driven/reactive. (priority: high)
- [ ] [orchestrator][high] Implement label-driven state machine — issues progress: `needs-analysis` → `needs-decompose` → `needs-refine` → `ready` → `in-progress` → `in-review` → `done`. (priority: high)
- [ ] [orchestrator][high] Implement global spec gap analysis — product analyst + architecture analyst agents run before decomposition. (priority: high)
- [ ] [orchestrator][high] Implement epic decomposition — spec → vertical slice parent issues with sub-issue hierarchy. (priority: high)
- [ ] [orchestrator][high] Implement dispatch — sub-issues labeled `aloop/ready` dispatched as child `loop.sh` instances. (priority: high)
- [ ] [orchestrator][high] Implement monitor + gate + merge — child PRs target `agent/trunk`, automated gates, agent review, squash-merge approved PRs. (priority: high)

**Infinite loop prevention:**
- [ ] [runtime][high] Add provenance tagging — every agent commit includes `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers. (priority: high)

**GitHub integration:**
- [ ] [gh-workflows][high] Implement efficient GitHub monitoring — ETag-guarded REST for change detection + GraphQL for full state fetch. (priority: high)
- [ ] [gh-workflows][high] Add `aloop gh stop-watch` control path. (priority: high)

### Up Next (P2 — Setup, Dashboard, Polish)
- [ ] [setup][high] Upgrade `aloop setup` to detect `.github/workflows`, check Actions availability, prompt for CI setup.
- [ ] [setup][high] Add non-interactive `--mode loop|orchestrate` flag and confirmation summary.
- [ ] [dashboard][high] Move per-provider health to dedicated left-pane sidebar tab.
- [ ] [dashboard][medium] Add per-iteration timing/duration in log rows and session elapsed context in header.
- [ ] [dashboard][medium] Add sidebar expand/collapse toggle button.
- [ ] [status][medium] Extend `aloop status` for orchestrator→child session→issue/PR tree output.
