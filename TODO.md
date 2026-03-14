# Project TODO

## Current Phase: P2 Spec Parity Closure (GH workflows + dashboard + pipeline)

### In Progress
- [ ] [review] Gate 3: Raise `aloop/cli/src/commands/gh.ts` branch coverage to `>=80%` — currently at `65.80%` with large uncovered branch clusters in watch-state normalization, CLI option validation, feedback-resume, stop-policy, and start/watch/status/stop command paths (priority: high) (stuck after 3 attempts — consider splitting into targeted test batches)
- [ ] [review] Gate 3: Produce branch-coverage evidence for touched dashboard files (`aloop/cli/dashboard/src/App.tsx`, `aloop/cli/dashboard/e2e/smoke.spec.ts`) at or above threshold (priority: high)
- [ ] [review] Gate 1: Implement watch-cycle completion finalization — `refreshWatchState()` detects running→completed transitions but does NOT create PRs or post issue summaries for sessions that completed after launch (priority: high)
- [ ] [review] Gate 1: Close GH workflow spec gaps — no `@aloop` mention detection, no CI failure log ingestion via `gh run view --log-failed`, no `gh stop-watch` command (priority: high)
- [ ] [review] Gate 2: Strengthen `aloop/cli/src/commands/gh.test.ts` — replace weak `output.length > 0` assertions with concrete payload checks; add tests for feedback fetch/parse/resume failure branches in `checkAndApplyPrFeedback` catch paths (priority: high)
- [ ] [review] Gate 6: Reconcile proof manifest iteration 43 — listed artifacts are missing and dashboard UI change proof lacks screenshot evidence (priority: high)

### Up Next
- [ ] [bug][high] Fix CLI resume bug: `aloop start <session-id> --launch resume` creates a new branch/session instead of reusing the existing session's worktree and branch. It should find the existing session, reuse the worktree if valid, or recreate it on the existing branch.
- [ ] [setup][high] Update `aloop setup` to auto-detect GitHub Actions, check Actions support, and ask user about setting up quality gate workflows.
- [ ] [orchestrator][high] Update planning/decomposition agents to include "Set up GitHub Actions CI" as an early foundation task when no CI exists, and ensure build agents can create/modify `.github/workflows/*.yml`.
- [ ] [pipeline][high] Create `loop-plan.json` compiler — takes pipeline YAML config (or defaults), resolves providers/models/reasoning per agent, outputs compiled JSON to session directory. This is the foundational piece for all pipeline work.
- [ ] [pipeline][high] Update `loop.sh` and `loop.ps1` to read `loop-plan.json` each iteration instead of hardcoded phase calculation — pick agent at `cyclePosition % cycle.length`, use entry's provider/model/prompt/reasoning.
- [ ] [pipeline][medium] Add runtime mutation — host monitor watches `status.json`, applies transition rules from pipeline config, rewrites `loop-plan.json` when needed (failure recovery, steering, agent injection).
- [ ] [pipeline][medium] Add guard agent and escalation ladder as pipeline configs handled by the compiler and mutator.
- [ ] [dashboard][high] Move per-provider health out of the header into a dedicated left-pane tab; keep steer controls always visible.
- [ ] [dashboard][medium] Add per-iteration duration to log rows and session timing context to header (elapsed, total iterations, average iteration duration).
- [ ] [dashboard][medium] Add sidebar expand/collapse button, vertically centered with header title row.
- [ ] [dashboard][medium] Add overflow ellipsis menu for large doc sets.
- [ ] [dashboard][medium] Add commit diffstat and per-file change type badges (M/A/D/R) to commit detail views.
- [ ] [status][medium] Extend `aloop status` to render orchestrator tree output (orchestrator session → child sessions → issue/PR mapping).
- [ ] [spec-parity][low] Reconcile architecture constraints (`zero npm deps`, `.mjs`-only/no-build, `lib/config.mjs`) with current TypeScript/bundled CLI reality, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
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
- [~] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions and backward-compatible defaults — replaced by loop-plan.json compiler approach per steering.
- [~] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder behavior per spec — replaced by loop-plan.json mutation approach per steering.

## Blocked

- [review] Gate 3: `gh.ts` branch coverage at 65.80% (stuck after 3 attempts). Consider: (a) splitting into targeted test batches by command group, (b) extracting helper functions to reduce branch complexity, or (c) accepting 70% with documented exclusions for CLI parsing boilerplate.
