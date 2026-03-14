# Project TODO

## Current Phase: P2 Spec Parity Closure (Runtime + Dashboard + GH Workflows)

### In Progress
- [x] [runtime][high] Align success-path loop state semantics in `aloop/bin/loop.sh` + `aloop/bin/loop.ps1` to emit spec-compliant terminal states (`stopped`/`exited`) and verify `stuck_count` reset behavior on successful iterations (prevents dashboard/runtime drift).
- [ ] [tests][high] Raise `aloop/cli/src/commands/gh.ts` branch coverage from 78.46% to >=80% with targeted branch tests (`issue-label` remove path, parse fallbacks/errors, throw paths) to clear gate failures.
- [x] [review][high] Close proof Gate 6 by generating missing artifacts (`dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, `loop-exit-state-proof.txt`) or updating manifest references so review evidence is complete.

### Up Next
- [ ] [review][high] Extend branch-evidence gate to include touched `loop.ps1` runtime branches (not only `loop.sh`) so shell parity is provable on both platforms.
- [ ] [dashboard][high] Replace header wrapping layout with CSS grid `fr` columns so provider/model/status/timestamp never clip on narrower widths.
- [ ] [dashboard][high] Move per-provider health status out of the top header into a dedicated left-pane dashboard tab.
- [ ] [dashboard][medium] Show provider+model together and add timing context (per-iteration duration, session elapsed, total iterations, average iteration duration) for quick health triage.
- [ ] [dashboard][medium] Vertically center the sidebar expand/collapse button with the header title row.
- [ ] [dashboard][medium] Filter docs tabs to non-empty content and add overflow/ellipsis behavior to keep docs panel usable with many files.
- [ ] [gh-workflows][medium] Implement high-level GH workflow commands `aloop gh start|watch|status|stop` with persisted issue/session mapping to match P2 command surface.
- [ ] [gh-workflows][medium] Implement PR feedback re-iteration loop (review comments + CI failure ingestion) with dedupe and max-iteration safety limits.
- [ ] [status][medium] Extend `aloop status` to render orchestrator tree (orchestrator session -> child sessions -> issue/PR mapping) to improve operational visibility.
- [ ] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions and backward-compatible defaults.
- [ ] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder behavior per spec to support adaptive loops.
- [ ] [spec-parity][low] Reconcile architecture constraints (`zero npm deps`, `.mjs`-only/no-build, `lib/config.mjs`) with current TypeScript/bundled CLI reality, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep to prevent regressions.

### Completed
- [x] [status][medium] `aloop status --watch` terminal auto-refresh loop is already implemented.
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
