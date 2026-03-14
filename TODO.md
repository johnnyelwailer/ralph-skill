# Project TODO

## Current Phase: P2 Spec Parity Closure (GH workflows + dashboard + pipeline)

### In Progress
- [ ] [gh-workflows][high] Implement watch-cycle completion finalization so completed sessions trigger PR creation + issue summary posting, matching `gh start` behavior.
- [ ] [gh-workflows][high] Close PR feedback trigger gaps by adding `@aloop` mention detection and CI failed-log ingestion (`gh run view --log-failed`) into steering generation.

### Up Next
- [ ] [gh-workflows][high] Add a dedicated `aloop gh stop-watch` control path so watch daemons are cleanly stoppable/resumable per spec.
- [ ] [test][high] Harden `gh.test.ts`: replace weak output assertions with concrete payload checks and add coverage for feedback fetch/parse/resume failure branches.
- [ ] [test][high] Add targeted option-validation tests for `gh start/watch/status/stop` and `watch-state`/`stop-policy` branches; then raise `gh.ts` branch coverage to `>=80%`.
- [ ] [setup][high] Upgrade `aloop setup` interactive flow to detect `.github/workflows`, check Actions availability/policy, and prompt for quality-gate workflow setup.
- [ ] [setup][high] Add non-interactive mode selection (`--mode loop|orchestrate`) and summary output that reflects recommended/selected execution mode.
- [ ] [pipeline][high] Implement runtime compiler that writes session `loop-plan.json` from pipeline/default cycle definitions (foundation for mutable pipelines).
- [ ] [pipeline][high] Replace hardcoded `plan/build/proof/review` modulo logic in `loop.sh` + `loop.ps1` with per-iteration `loop-plan.json` cycle resolution.
- [ ] [pipeline][medium] Add host-side runtime mutation that rewrites `loop-plan.json` (and queue entries) from `status.json` events for failure recovery and steering injections.
- [ ] [pipeline][medium] Add guard-agent + escalation-ladder config handling to compiler/mutator flow.
- [ ] [dashboard][high] Move per-provider health to a dedicated left-pane tab and keep header focused on session identity/progress.
- [ ] [dashboard][medium] Add per-iteration duration in log rows plus elapsed/iteration-count/average-duration timing context in header.
- [ ] [dashboard][medium] Add sidebar expand/collapse control aligned with header title row, and docs overflow `...` menu for large doc sets.
- [ ] [dashboard][medium] Add commit diffstat and per-file change-type badges (`M/A/D/R`) in commit detail views.
- [ ] [status][medium] Extend `aloop status` to render orchestrator tree output (orchestrator session → child sessions → issue/PR mapping).
- [ ] [orchestrator][medium] Update decomposition/planning prompts to inject an early "Set up GitHub Actions CI" foundation task when workflows are absent.
- [ ] [review][high] Produce branch-coverage evidence for touched dashboard files (`App.tsx`, `e2e/smoke.spec.ts`) at or above gate threshold.
- [ ] [review][high] Reconcile missing proof-manifest iteration-43 artifacts and attach dashboard screenshot evidence required by review gate.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
- [x] [bug][high] Fixed CLI resume semantics: `aloop start <session-id> --launch resume` now reuses the existing session/worktree/branch (or recreates worktree on the same branch) instead of creating a new session/branch.
- [x] [spec-parity][low] Reconciled architecture constraints (`zero npm deps`, `.mjs`-only/no-build) with current TypeScript/bundled CLI reality by updating spec explicitly.
- [x] [review][high] Gate 5: Fix TS2345 regression in `gh.test.ts` (`buildWatchEntry().status` typed as `string` instead of `GhWatchIssueStatus`).
- [x] [review][high] Gate 4: Remove dead code in `gh.ts` — unused `response` from `/reviews` API in `fetchPrReviewComments`.
- [x] [review][high] Gate 3 Blocker: Fix hardcoded Windows path separators in `playwright.config.ts`.
- [x] [review][high] Closed proof-artifact gate: required artifacts (`dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, `loop-exit-state-proof.txt`) are present.
- [x] [review][high] Branch-evidence parity includes PowerShell proof-path coverage for `loop.ps1` at >=80% via `loop.tests.ps1`.
- [x] [runtime][high] Aligned success-path loop state semantics in `loop.sh` + `loop.ps1` to emit spec-compliant terminal states (`stopped`/`exited`) and `stuck_count` reset on success.
- [x] [gh-workflows][high] Implemented high-level `aloop gh start --issue <N>` flow.
- [x] [gh-workflows][high] Implemented `aloop gh watch|status|stop` with persisted issue↔session mapping.
- [x] [gh-workflows][high] Implemented PR feedback re-iteration loop (review comments + CI check run conclusions).
- [x] [dashboard][high] Replaced header layout with CSS grid `fr` columns.
- [x] [dashboard][medium] Show provider+model together in header.
- [x] [dashboard][medium] Filter docs tabs to non-empty content.
- [x] [dashboard][medium] `/aloop:dashboard` + `copilot/prompts/aloop-dashboard.prompt.md` command artifacts exist (spec file-presence criterion satisfied).
- [x] [status][medium] `aloop status --watch` terminal auto-refresh loop is implemented.
- [x] [triage][high] Prevented actionable triage loss before child dispatch via deferred steering queue.
- [x] [triage][high] Added triage monitor-cycle wiring, classification/actions, bot/external filtering, and triage footer replies.
- [x] [triage][high] Added STEERING.md injection for actionable comments with existing child sessions.
- [x] [tests][high] Expanded orchestrate triage coverage for mixed-classification batches and GH error propagation.
- [x] [gh-policy][high] Added GH triage prerequisite subcommands: `issue-label`, `issue-comments --since`, `pr-comments --since`.
- [x] [orchestrator][high] Delivered child-loop dispatch engine with concurrency cap, worktree/branch mapping, and lifecycle tracking.
- [x] [orchestrator][high] Delivered PR lifecycle gates with squash-merge handling.
- [x] [dashboard-runtime][high] Added dead-PID liveness correction in dashboard state loading/publish path.
- [x] [dashboard][medium] Added multi-session dashboard APIs/session switching and proof artifact rendering.

### Cancelled
- [~] [review] Gate 3: Raise `aloop/cli/src/commands/gh.ts` branch coverage to `>=80%` (stuck after 3 attempts, split into targeted test batches).
- [~] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions and backward-compatible defaults — replaced by loop-plan.json compiler approach per steering.
- [~] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder behavior per spec — replaced by loop-plan.json mutation approach per steering.

## Blocked
(None)
