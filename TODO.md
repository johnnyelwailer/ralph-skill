# Project TODO

## Current Phase: Loop Script Refactoring + Orchestrator Implementation

### In Progress (P0 — Loop Script Refactoring)
- [ ] [loop][critical] Replace hardcoded `plan/build/proof/review` modulo logic in `loop.sh` + `loop.ps1` with `loop-plan.json` cycle resolution — read prompt filename at `cyclePosition % cycle.length`, parse frontmatter for provider/model/agent/reasoning.
- [ ] [loop][critical] Add `queue/` folder check before cycle — if queue has `.md` files, pick first (sorted), parse frontmatter, run it, delete after. Do NOT advance `cyclePosition` for queue items.
- [ ] [loop][critical] Add shared `parse_frontmatter()` function (sed-based, ~6 lines) — extracts provider/model/agent/reasoning from `---` delimited YAML header. Same parser for cycle prompts and queue prompts.
- [ ] [loop][high] Add `requests/` wait loop — after agent completes, if `requests/*.json` exist, poll until directory empties or timeout (default 300s).
- [ ] [loop][high] Implement equivalent changes in `loop.ps1` (PowerShell frontmatter parser, queue check, request wait).

### Up Next (P1 — Orchestrator + GH Implementation)
- [ ] [pipeline][high] Implement runtime compiler that writes session `loop-plan.json` from pipeline/default cycle definitions.
- [ ] [pipeline][high] Generate prompt files with frontmatter from pipeline config during session setup.
- [ ] [pipeline][medium] Add host-side runtime mutation — process `requests/*.json`, queue follow-up prompts, rewrite `loop-plan.json` for permanent changes.
- [ ] [orchestrator][high] Implement orchestrator as a `loop.sh` instance with `PROMPT_orch_scan.md` cycle and queue-driven reactive model.
- [ ] [orchestrator][high] Implement request processing in runtime — handle all 11 request types (create_issues, dispatch_child, etc.) with file-path body references.
- [ ] [orchestrator][high] Implement label-driven state machine (needs-analysis → needs-decompose → needs-refine → ready → in-progress → in-review → done).
- [ ] [orchestrator][medium] Add spec gap analyst agents (product + architecture) with autonomy-level-aware resolver.
- [ ] [orchestrator][medium] Add spec consistency agent — runs after spec changes to reorganize, verify cross-references, remove contradictions, and ensure clean structure.
- [ ] [orchestrator][medium] Add Definition of Ready gate with specialist planners (FE/BE/infra) and estimation agent.
- [ ] [gh-workflows][high] Implement watch-cycle completion finalization (completed sessions → PR creation + issue summary).
- [ ] [gh-workflows][high] Close PR feedback trigger gaps (`@aloop` mention detection, CI failed-log ingestion).
- [ ] [gh-workflows][high] Add `aloop gh stop-watch` control path.
- [ ] [gh-workflows][high] Integrate GitHub Actions for quality gates — discover workflows, prefer CI over local, CI failure feedback loop.

### Up Next (P2 — Setup, Dashboard, Polish)
- [ ] [setup][high] Upgrade `aloop setup` to detect `.github/workflows`, check Actions availability, prompt for CI setup.
- [ ] [setup][high] Add non-interactive mode selection and confirmation summary with auto-suggested settings.
- [ ] [cli][high] Fix `aloop start --launch resume` to reuse existing session worktree/branch instead of creating new ones.
- [ ] [dashboard][high] Move per-provider health to dedicated left-pane tab.
- [ ] [dashboard][medium] Add timing context (per-iteration duration, elapsed, averages).
- [ ] [dashboard][medium] Add sidebar alignment and docs overflow menu.
- [ ] [status][medium] Extend `aloop status` for orchestrator tree output.
- [ ] [test][high] Harden `gh.test.ts` assertions and raise branch coverage to >=80%.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
- [x] [bug][high] Fixed CLI resume semantics: `aloop start <session-id> --launch resume` now reuses the existing session/worktree/branch (or recreates worktree on the same branch) instead of creating a new session/branch.
- [x] [gh-workflows][high] Implemented watch-cycle completion finalization so completed sessions trigger PR creation + issue summary posting.
- [x] [spec-parity][low] Reconciled architecture constraints (`zero npm deps`, `.mjs`-only/no-build) with current TypeScript/bundled CLI reality by updating spec explicitly.
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
- [~] [review] Gate 3: gh.ts branch coverage >=80% (stuck, split into targeted batches).
- [~] [pipeline] Old pipeline YAML config approach — replaced by loop-plan.json + frontmatter.
