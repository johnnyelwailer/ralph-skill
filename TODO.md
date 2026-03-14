# Project TODO

## Current Phase: P2 Spec Parity Closure (GH workflows + dashboard + pipeline)

### In Progress
- [x] [review] Gate 5: Fix regression in validation pipeline — `cd aloop/cli && npm run type-check` fails with TS2345 in `src/commands/gh.test.ts` (lines 1937, 1953, 1964, 2032, 2050; `buildWatchEntry().status` typed as `string` instead of `GhWatchIssueStatus`) (priority: high)
- [x] [review] Gate 4: Remove dead code in `aloop/cli/src/commands/gh.ts` — `fetchPrReviewComments` assigns `response` from `/reviews` API (line 489) but never uses it; either wire it into review-state handling or remove the unused call (priority: medium)
- [ ] [review] Gate 3: Raise `aloop/cli/src/commands/gh.ts` branch coverage to `>=80%` — currently at `65.80%` with large uncovered branch clusters in watch-state normalization, CLI option validation, feedback-resume, stop-policy, and new start/watch/status/stop command paths (priority: high)
- [ ] [review] Gate 3: Produce branch-coverage evidence for touched dashboard files (`aloop/cli/dashboard/src/App.tsx`, `aloop/cli/dashboard/e2e/smoke.spec.ts`) at or above threshold (priority: high)
- [x] [review] Gate 3 Blocker: Fix hardcoded Windows path separators (`\\`) in `aloop/cli/dashboard/playwright.config.ts` webServer command (line 18) which break Linux execution (`MODULE_NOT_FOUND` for `..distindex.js`) (priority: high)
- [ ] [review] Gate 1: Implement watch-cycle completion finalization — `refreshWatchState()` detects running→completed transitions but does NOT create PRs or post issue summaries for sessions that completed after launch (where `pending_completion` was true); need post-completion PR creation + issue comment in the watch cycle (priority: high)
- [ ] [review] Gate 1: Close GH workflow spec gaps in `gh watch` feedback handling — no `@aloop` mention detection, no manual trigger handling, no review-change semantics, no CI failure log context ingestion; PR feedback loop only checks review comments + check run conclusions (priority: high)
- [ ] [review] Gate 2: Strengthen `aloop/cli/src/commands/gh.test.ts` for non-happy/error branches — replace weak assertions like `output.length > 0` with concrete payload checks and add explicit tests for feedback fetch/parse/resume failure branches swallowed by `checkAndApplyPrFeedback` catch paths (priority: high)
- [ ] [review] Gate 6: Reconcile proof manifest iteration 43 with real artifacts — listed files (`gh-help.txt`, `gh-status-text.txt`, `gh-status-json.json`, `gh-stop-all-success.json`, `gh-status-after-stop.txt`, `dashboard-api-state.json`, `dashboard-server.log`, `gh-stop-json.json`) are missing, and dashboard UI change proof skipped the required screenshot evidence (priority: high)

### Up Next
- [x] [gh-workflows][high] Implement high-level `aloop gh start --issue <N>` flow (issue fetch, branch/session/worktree setup, loop launch, PR creation/link-back summary) to match the P2 command surface.
- [x] [gh-workflows][high] Implement `aloop gh watch|status|stop` with persisted issue↔session mapping and concurrency-aware queueing (`~/.aloop/watch.json`) so GH-linked sessions are observable/controllable.
- [x] [gh-workflows][high] Implement PR feedback re-iteration loop (review comments + CI failure ingestion) with run/comment dedupe and max-iteration safety caps.
- [x] [dashboard][high] Replace header wrapping layout with CSS grid `fr` columns so provider/model/status/timestamp never clip on narrower widths.
- [x] [dashboard][medium] Show provider+model together in header (format: `providerName/modelName`).
- [x] [dashboard][medium] Filter docs tabs to non-empty content (panel-level empty check + individual DocEntry content guard).
- [ ] [dashboard][high] Move per-provider health out of the top header into a dedicated left-pane tab and keep steer controls always visible.
- [ ] [dashboard][medium] Add timing context to header and iteration rows (per-iteration duration, session elapsed, total iterations, average iteration duration).
- [ ] [dashboard][medium] Add overflow ellipsis menu for large doc sets.
- [ ] [dashboard][medium] Vertically center the sidebar expand/collapse button with the header title row.
- [ ] [status][medium] Extend `aloop status` to render orchestrator tree output (orchestrator session -> child sessions -> issue/PR mapping).
- [~] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions and backward-compatible defaults. — cancelled: replaced by loop-plan.json compiler approach per steering
- [~] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder behavior per spec. — cancelled: replaced by loop-plan.json mutation approach per steering
- [ ] [pipeline][medium] Create `loop-plan.json` compiler in runtime — takes pipeline YAML config (or defaults), resolves providers/models/reasoning per agent, outputs compiled JSON file to session directory.
- [ ] [pipeline][medium] Update `loop.sh` and `loop.ps1` to read `loop-plan.json` each iteration instead of hardcoded phase calculation — pick agent at `cyclePosition % cycle.length`, use entry's provider/model/prompt/reasoning.
- [ ] [pipeline][medium] Add runtime mutation — host monitor watches `status.json`, applies transition rules from pipeline config, rewrites `loop-plan.json` when needed (failure recovery, steering, agent injection).
- [ ] [pipeline][medium] Add guard agent and escalation ladder as pipeline configs handled by the compiler and mutator.
- [ ] [spec-parity][low] Reconcile architecture constraints (`zero npm deps`, `.mjs`-only/no-build, `lib/config.mjs`) with current TypeScript/bundled CLI reality, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
- [x] [review][high] Closed proof-artifact gate: required artifacts (`dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, `loop-exit-state-proof.txt`) are present.
- [x] [review][high] Branch-evidence parity now includes PowerShell proof-path coverage for `aloop/bin/loop.ps1` at `>=80%` threshold via `loop.tests.ps1`.
- [x] [runtime][high] Aligned success-path loop state semantics in `aloop/bin/loop.sh` + `aloop/bin/loop.ps1` to emit spec-compliant terminal states (`stopped`/`exited`) and verified `stuck_count` reset behavior on successful iterations.
- [x] [status][medium] `aloop status --watch` terminal auto-refresh loop is implemented.
- [x] [triage][high] Prevented actionable triage loss before child dispatch by deferring steering when `child_session` is missing and flushing deferred steering once a child session exists.
- [x] [tests][high] Added regression coverage for actionable comments when `child_session` is missing (asserts `steering_deferred` + pending steering queue behavior).
- [x] [triage][high] Added triage monitor-cycle wiring in orchestrator flow when repo + GH executor are available.
- [x] [triage][high] Added triage classification/actions for `actionable|needs_clarification|question|out_of_scope`, including bot/external filtering and triage footer replies.
- [x] [triage][high] Added STEERING.md injection for actionable comments when a child session exists.
- [x] [tests][high] Expanded orchestrate triage coverage for mixed-classification batches and GH error propagation paths.
- [x] [gh-policy][high] Added GH triage prerequisite subcommands: `issue-label`, `issue-comments --since`, `pr-comments --since`.
- [x] [orchestrator][high] Delivered child-loop dispatch engine with concurrency cap, worktree/branch mapping, and lifecycle tracking.
- [x] [orchestrator][high] Delivered PR lifecycle gates (mergeability/checks/review) with squash-merge handling.
- [x] [dashboard-runtime][high] Added dead-PID liveness correction in dashboard state loading/publish path so stale `running` states auto-correct.
- [x] [dashboard][medium] Added multi-session dashboard APIs/session switching and proof artifact rendering.
