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

### Up Next (P1 — Orchestrator + Runtime + GH Integration)

**Runtime (aloop CLI, TS/Bun):**
- [x] [runtime][high] Implement loop-plan.json compiler — compile cycle prompt filenames from session config, generate prompt files with frontmatter during session setup. (priority: high)
- [x] [runtime][high] Implement request processing — watch `requests/*.json`, validate against contract, execute side effects, delete requests, queue follow-up prompts into `queue/`. Handle all 11 request types. (priority: high)
- [x] [runtime][high] Add runtime plan mutation — rewrite `loop-plan.json` on permanent changes, write queue entries for one-shot overrides. (priority: high)

**Orchestrator (loop.sh instance with orchestrator prompts):**
- [ ] [orchestrator][high] Implement orchestrator as a `loop.sh` instance — single `PROMPT_orch_scan.md` cycle (heartbeat), primarily queue-driven/reactive. (priority: high)
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


