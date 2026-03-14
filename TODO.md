# Project TODO

## Current Phase: Loop Script Refactoring + Review Gate Closure

### In Progress (P0 — Review Gates + Loop Script Completion)
- [x] [review] Gate 1: `gh.ts` marks `completion_finalized=true` unconditionally after `finalizeWatchEntry` (lines 968-974) even when PR create/comment steps fail; wrap the assignment in a success check so failed finalizations can be retried (priority: high)
- [x] [review] Gate 2: Add explicit tests for `@aloop` issue-comment trigger handling in `gh.test.ts` — positive case (comment containing `@aloop` is detected) and negative case (comment without mention is filtered out); current tests pass `[]` issue comments and don't exercise the `.includes('@aloop')` filter at line 643 (priority: high)
- [x] [review] Gate 2: Add CI failed-log ingestion assertions in `gh.test.ts` for `fetchFailedCheckLogs`/`buildFeedbackSteering` — must cover the `gh run view --log-failed` call at line 560 and the >200-line truncation path (priority: high)
- [ ] [review] Gate 3: Raise `gh.ts` branch coverage from 63.32% to >=80% via `npx c8 --all --include=src/commands/gh.ts tsx --test src/commands/gh.test.ts`, targeting uncovered branches in feedback/finalization/start/watch/status/stop paths (priority: high)
- [ ] [review] Gate 3: Provide >=80% branch evidence for `loop.sh` and `loop.ps1` — add branch probes/tests covering cycle resolution from `loop-plan.json` + frontmatter application paths (priority: high)
- [ ] [review] Gate 6: Regenerate proof artifacts (`gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`) or correct manifest paths so iteration 11 is verifiable (priority: high)
- [ ] [loop][critical] Add `queue/` folder check before cycle — if `queue/` has `.md` files, pick first (sorted), parse frontmatter, run it, delete after completion; do NOT advance `cyclePosition` for queue items. Must implement in both `loop.sh` and `loop.ps1`. (priority: critical)
- [ ] [loop][high] Add `requests/` wait loop — after agent completes, if `requests/*.json` exist, poll until directory empties or timeout (default 300s). Must implement in both `loop.sh` and `loop.ps1`. (priority: high)

### Up Next (P1 — Pipeline Compiler + Orchestrator)
- [ ] [pipeline][high] Implement runtime compiler that writes session `loop-plan.json` from pipeline/default cycle definitions (SPEC.md:59).
- [ ] [pipeline][high] Generate prompt files with frontmatter from pipeline config during session setup.
- [ ] [pipeline][medium] Add host-side runtime mutation — process `requests/*.json`, queue follow-up prompts, rewrite `loop-plan.json` for permanent changes.
- [ ] [orchestrator][high] Implement orchestrator as a `loop.sh` instance with `PROMPT_orch_scan.md` cycle and queue-driven reactive model.
- [ ] [orchestrator][high] Implement request processing in runtime — handle all 11 request types (create_issues, dispatch_child, etc.) with file-path body references.
- [ ] [orchestrator][high] Implement label-driven state machine (needs-analysis → needs-decompose → needs-refine → ready → in-progress → in-review → done).
- [ ] [orchestrator][medium] Add spec gap analyst agents (product + architecture) with autonomy-level-aware resolver.
- [ ] [orchestrator][medium] Add spec consistency agent — runs after spec changes to reorganize, verify cross-references, remove contradictions.
- [ ] [orchestrator][medium] Add Definition of Ready gate with specialist planners (FE/BE/infra) and estimation agent.
- [ ] [gh-workflows][high] Add `aloop gh stop-watch` control path (currently watch daemon only stops via SIGINT/SIGTERM).
- [ ] [gh-workflows][high] Integrate GitHub Actions for quality gates — discover workflows, prefer CI over local, CI failure feedback loop.

### Up Next (P2 — Setup, Dashboard, Polish)
- [ ] [setup][high] Upgrade `aloop setup` to detect `.github/workflows`, check Actions availability, prompt for CI setup (SPEC.md:676-679).
- [ ] [setup][high] Add non-interactive `--mode loop|orchestrate` flag and confirmation summary with auto-suggested settings.
- [ ] [dashboard][high] Move per-provider health to dedicated left-pane sidebar tab (currently inline in header at App.tsx:385-389).
- [ ] [dashboard][medium] Add per-iteration timing/duration in log rows and session elapsed/total iterations/average duration in header.
- [ ] [dashboard][medium] Add sidebar expand/collapse toggle button.
- [ ] [dashboard][medium] Add overflow ellipsis menu for large doc sets in docs panel.
- [ ] [dashboard][medium] Add commit diffstat/change-type badges (M/A/D/R markers) in commit detail views.
- [ ] [status][medium] Extend `aloop status` for orchestrator→child session→issue/PR tree output.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
- [x] [loop][critical] Replace hardcoded `plan/build/proof/review` modulo logic in `loop.sh` + `loop.ps1` with `loop-plan.json` cycle resolution — read prompt filename at `cyclePosition % cycle.length`, parse frontmatter for provider/model/agent/reasoning.
- [x] [loop][critical] Add shared `parse_frontmatter()` function (sed-based) — extracts provider/model/agent/reasoning from `---` delimited YAML header.
- [x] [gh-workflows][high] Add `@aloop` mention detection in PR feedback loop (gh.ts:643).
- [x] [gh-workflows][high] Add CI failed-log ingestion via `fetchFailedCheckLogs` (gh.ts:550-573).
- [x] [bug][high] Fixed CLI resume semantics: `aloop start <session-id> --launch resume` now reuses the existing session/worktree/branch.
- [x] [gh-workflows][high] Implemented watch-cycle completion finalization (completed sessions → PR creation + issue summary).
- [x] [spec-parity][low] Reconciled architecture constraints with current TypeScript/bundled CLI reality.
- [x] [review][high] Gate 5: Fix TS2345 regression in `gh.test.ts`.
- [x] [review][high] Gate 4: Remove dead code in `gh.ts`.
- [x] [review][high] Gate 3 Blocker: Fix hardcoded Windows path separators in `playwright.config.ts`.
- [x] [review][high] Closed proof-artifact gate.
- [x] [review][high] Branch-evidence parity includes PowerShell proof-path coverage.
- [x] [runtime][high] Aligned success-path loop state semantics in `loop.sh` + `loop.ps1`.
- [x] [gh-workflows][high] Implemented `aloop gh start --issue <N>`, `watch|status|stop`, PR feedback loop.
- [x] [dashboard][high] CSS grid layout, provider+model display, docs filtering.
- [x] [status][medium] `aloop status --watch` terminal auto-refresh.
- [x] [triage][high] Triage monitor-cycle, classification, deferred steering, bot filtering.
- [x] [orchestrator][high] Child-loop dispatch engine, PR lifecycle gates.
- [x] [dashboard-runtime][high] Dead-PID liveness correction, multi-session APIs.

### Cancelled
- [~] [review] Gate 3: gh.ts branch coverage >=80% (stuck at 63.32%, split into targeted batches).
- [~] [pipeline] Old pipeline YAML config approach — replaced by loop-plan.json + frontmatter.
