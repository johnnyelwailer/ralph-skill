# Project TODO

## Current Phase: P2 Spec Parity Closure (GH workflows + dashboard + pipeline)

### In Progress
- [x] [tests][high] Raise `aloop/cli/src/commands/gh.ts` branch coverage from `78.46%` to `>=80%` with targeted branch tests (remove-label path, parser fallback/error paths, and throw/default branches) to clear review gate failures.

### Up Next
- [x] [gh-workflows][high] Implement high-level `aloop gh start --issue <N>` flow (issue fetch, branch/session/worktree setup, loop launch, PR creation/link-back summary) to match the P2 command surface.
- [ ] [gh-workflows][high] Implement `aloop gh watch|status|stop` with persisted issue↔session mapping and concurrency-aware queueing (`~/.aloop/watch.json`) so GH-linked sessions are observable/controllable.
- [ ] [gh-workflows][high] Implement PR feedback re-iteration loop (review comments + CI failure ingestion) with run/comment dedupe and max-iteration safety caps.
- [ ] [dashboard][high] Replace header wrapping layout with CSS grid `fr` columns so provider/model/status/timestamp never clip on narrower widths.
- [ ] [dashboard][high] Move per-provider health out of the top header into a dedicated left-pane tab and keep steer controls always visible.
- [ ] [dashboard][medium] Show provider+model together in iteration rows and add timing context (per-iteration duration, session elapsed, total iterations, average iteration duration).
- [ ] [dashboard][medium] Filter docs tabs to non-empty content (currently filters `TODO.md` by name and empty arrays, but not empty-string content) and add overflow ellipsis menu for large doc sets.
- [ ] [dashboard][medium] Vertically center the sidebar expand/collapse button with the header title row.
- [ ] [status][medium] Extend `aloop status` to render orchestrator tree output (orchestrator session -> child sessions -> issue/PR mapping).
- [ ] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions and backward-compatible defaults.
- [ ] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder behavior per spec.
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
