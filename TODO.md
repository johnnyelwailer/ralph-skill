# Project TODO

## Current Phase: Loop Script Completion + Orchestrator Implementation

### In Progress (P0 — Loop Script Completion)
- [x] [loop][critical] Add `queue/` folder check before cycle — if `queue/` has `.md` files, pick first (sorted), parse frontmatter, run it, delete after completion; do NOT advance `cyclePosition` for queue items. Must implement in both `loop.sh` and `loop.ps1`. (priority: critical)
- [x] [loop][critical] Add requests/ wait loop — after agent completes, if requests/*.json exist, poll until directory empties or timeout (default 300s). Must implement in both loop.sh and loop.ps1. (priority: critical)
- [x] [loop][high] Add opencode provider support to loop.ps1 (already done in loop.sh). (priority: high)
- [x] [review] Gate 3: Raise `gh.ts` branch coverage from 63.32% to >=80% (priority: medium)
- [x] [review] Gate 3: Provide >=80% branch evidence for `loop.sh` and `loop.ps1` — cycle resolution + frontmatter paths (priority: medium)
- [ ] [review] Gate 6: Regenerate proof artifacts or correct manifest paths so iteration 11 is verifiable (priority: medium)

### Up Next (P1 — Orchestrator + Runtime + GH Integration)

**Runtime (aloop CLI, TS/Bun):**
- [ ] [runtime][high] Implement loop-plan.json compiler — compile cycle prompt filenames from session config, generate prompt files with frontmatter during session setup. (priority: high)
- [ ] [runtime][high] Implement request processing — watch `requests/*.json`, validate against contract, execute side effects, delete requests, queue follow-up prompts into `queue/`. Handle all 11 request types: `create_issues`, `update_issue`, `close_issue`, `create_pr`, `merge_pr`, `dispatch_child`, `steer_child`, `stop_child`, `post_comment`, `query_issues`, `spec_backfill`. (priority: high)
- [ ] [runtime][high] Add runtime plan mutation — rewrite `loop-plan.json` on permanent changes (cycle edits, position adjustments), write queue entries for one-shot overrides (steering, forced review, debugger). (priority: high)

**Orchestrator (loop.sh instance with orchestrator prompts):**
- [ ] [orchestrator][high] Implement orchestrator as a `loop.sh` instance — single `PROMPT_orch_scan.md` cycle (heartbeat), primarily queue-driven/reactive. Runtime generates per-item work prompts into `queue/`. (priority: high)
- [ ] [orchestrator][high] Implement label-driven state machine — issues progress: `needs-analysis` → `needs-decompose` → `needs-refine` → `ready` → `in-progress` → `in-review` → `done`. Each label transition triggers appropriate agent work via queue. (priority: high)
- [ ] [orchestrator][high] Implement global spec gap analysis — product analyst + architecture analyst agents run before decomposition. Create `aloop/spec-question` issues for gaps. (priority: high)
- [ ] [orchestrator][high] Implement two-agent autonomy model — gap analysis always creates spec-question issues (audit trail). Resolver agent auto-resolves or waits based on autonomy level (cautious/balanced/autonomous). Risk classification: low/medium/high. (priority: high)
- [ ] [orchestrator][high] Implement epic decomposition — spec → vertical slice parent issues with sub-issue hierarchy. Wave assignment, file ownership hints, dependency tracking via GitHub native features. (priority: high)
- [ ] [orchestrator][high] Implement per-epic refinement — product analyst + architecture analyst + cross-epic dependency check. (priority: high)
- [ ] [orchestrator][high] Implement sub-issue decomposition + per-sub-issue refinement — specialist planners (FE/BE/infra/fullstack) + estimation agent. Definition of Ready gate before dispatch. (priority: high)
- [ ] [orchestrator][high] Implement dispatch — sub-issues labeled `aloop/ready` dispatched as child `loop.sh` instances. Concurrency cap, wave scheduling, file ownership deconfliction. (priority: high)
- [ ] [orchestrator][high] Implement monitor + gate + merge — child PRs target `agent/trunk`, automated gates (CI, coverage, conflicts, lint, spec regression), agent review, squash-merge approved PRs. Rejected PRs get feedback written to child's `queue/`. (priority: high)
- [ ] [orchestrator][medium] Add spec consistency agent — runs after spec changes to reorganize, verify cross-references, remove contradictions. Provenance-tagged to prevent self-triggering. (priority: medium)
- [ ] [orchestrator][medium] Add loop health supervisor agent — runs every N iterations, detects unhealthy patterns (repetitive cycling, queue thrashing, stuck cascades), can trip circuit breakers. (priority: medium)

**Infinite loop prevention:**
- [ ] [runtime][high] Add provenance tagging — every agent commit includes `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers. Runtime reads provenance before triggering follow-ups. Housekeeping agents never re-trigger themselves. (priority: high)

**GitHub integration:**
- [ ] [gh-workflows][high] Implement efficient GitHub monitoring — ETag-guarded REST for change detection + GraphQL for full state fetch. Optional webhook push for instant events. (priority: high)
- [ ] [gh-workflows][high] Integrate GitHub Actions for quality gates — discover workflows, prefer CI over local, CI failure feedback loop. (priority: high)
- [ ] [gh-workflows][high] Add `aloop gh stop-watch` control path (currently watch daemon only stops via SIGINT/SIGTERM). (priority: high)

**Bug fixes:**
- [ ] [bug][high] Fix CLI resume semantics — `aloop start <session-id> --launch resume` creates new session/branch instead of reusing existing one. Must reuse existing session/worktree/branch. (priority: high)

### Up Next (P2 — Setup, Dashboard, Polish)
- [ ] [setup][high] Upgrade `aloop setup` to detect `.github/workflows`, check Actions availability, prompt for CI setup.
- [ ] [setup][high] Add non-interactive `--mode loop|orchestrate` flag and confirmation summary with auto-suggested settings (including trunk branch name).
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
- [x] [loop][high] Add opencode provider support to `loop.sh` — optional model via `-m` flag, uses opencode's own config when model not specified.
- [x] [gh-workflows][high] Add `@aloop` mention detection in PR feedback loop (gh.ts:643).
- [x] [gh-workflows][high] Add CI failed-log ingestion via `fetchFailedCheckLogs` (gh.ts:550-573).
- [x] [gh-workflows][high] Implemented watch-cycle completion finalization (completed sessions → PR creation + issue summary).
- [x] [gh-workflows][high] Implemented `aloop gh start --issue <N>`, `watch|status|stop`, PR feedback loop.
- [x] [spec-parity][low] Reconciled architecture constraints with current TypeScript/bundled CLI reality.
- [x] [review][high] Gate 5: Fix TS2345 regression in `gh.test.ts`.
- [x] [review][high] Gate 4: Remove dead code in `gh.ts`.
- [x] [review][high] Gate 3 Blocker: Fix hardcoded Windows path separators in `playwright.config.ts`.
- [x] [review][high] Closed proof-artifact gate.
- [x] [review][high] Branch-evidence parity includes PowerShell proof-path coverage.
- [x] [review][high] Gate 1: `gh.ts` finalization success check.
- [x] [review][high] Gate 2: `@aloop` mention + CI log tests.
- [x] [runtime][high] Aligned success-path loop state semantics in `loop.sh` + `loop.ps1`.
- [x] [dashboard][high] CSS grid layout, provider+model display, docs filtering.
- [x] [status][medium] `aloop status --watch` terminal auto-refresh.
- [x] [triage][high] Triage monitor-cycle, classification, deferred steering, bot filtering.
- [x] [orchestrator][high] Child-loop dispatch engine, PR lifecycle gates.
- [x] [dashboard-runtime][high] Dead-PID liveness correction, multi-session APIs.

### Cancelled
- [~] [review] Gate 3: gh.ts branch coverage >=80% (stuck at 63.32%, split into targeted batches).
- [~] [pipeline] Old pipeline YAML config approach — replaced by loop-plan.json + frontmatter.
- [~] [bug] "Fixed CLI resume semantics" — was prematurely marked done; reopened above as P1 bug.
