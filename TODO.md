# Project TODO

## Current Phase: P2 Spec Parity Closure (Triage + Runtime + GH Workflows)

### In Progress
- [x] [triage][high] Prevent actionable triage loss before child dispatch: when `issue.child_session` is missing, do not finalize as `steering_injected` unless steering is durably queued/deferred. This protects human guidance from being silently dropped.

### Up Next
- [x] [tests][high] Add a regression test for actionable comments on issues without `child_session` (assert deferred/pending steering behavior and no false “processed” outcome).
- [x] [runtime][high] Align loop exit/state semantics to spec: emit `stopped`/`exited` in `status.json` and reset `stuck_count` on successful iterations (not only skip/unblock paths).
- [x] [dashboard-runtime][high] Add dead-PID liveness correction so dashboard state auto-flips stale `running` sessions to exited/stopped without manual intervention.
- [ ] [tests][high] Raise `gh.ts` branch coverage to >=80% with targeted missing branches (notably issue-label remove path and parse/error fallbacks).
- [ ] [dashboard][medium] Show provider+model together and add timing context (per-iteration duration, elapsed since `session_start`, total iterations, average iteration duration).
- [ ] [dashboard][medium] Update docs panel to render only non-empty docs and add overflow handling (`...`) for large doc sets.
- [ ] [gh-workflows][medium] Implement high-level GH orchestration commands: `aloop gh start --issue`, `aloop gh watch`, `aloop gh status`, `aloop gh stop` with persisted watch/status mapping.
- [ ] [gh-workflows][medium] Implement PR feedback re-iteration loop (review comments + CI failures) with configurable max feedback iterations and dedupe behavior.
- [ ] [status][medium] Extend `aloop status` to display orchestrator tree (orchestrator session -> child sessions -> issue/PR mapping).
- [ ] [pipeline][medium] Add configurable pipeline support (`.aloop/pipeline.yml` or inline config) with named agents/transitions (`retry|goto`) and backward-compatible defaults.
- [ ] [pipeline][medium] Add runtime pipeline mutation and guard-agent escalation ladder behavior per spec.
- [ ] [spec-parity][low] Reconcile spec architecture constraints (`zero npm deps`, `.mjs`-only/no-build, `lib/config.mjs`) with current TypeScript/bundled CLI, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final full SPEC acceptance sweep.

### Completed
- [x] [triage][high] Added triage monitor-cycle wiring in orchestrator flow when repo + GH executor are available.
- [x] [triage][high] Added triage classification/actions for `actionable|needs_clarification|question|out_of_scope`, including bot/external filtering and triage footer replies.
- [x] [triage][high] Added STEERING.md injection for actionable comments when a child session exists.
- [x] [tests][high] Expanded orchestrate triage coverage for mixed-classification batches and GH error propagation paths.
- [x] [gh-policy][high] Added GH triage prerequisite subcommands: `issue-label`, `issue-comments --since`, `pr-comments --since`.
- [x] [orchestrator][high] Delivered child-loop dispatch engine with concurrency cap, worktree/branch mapping, and lifecycle tracking.
- [x] [orchestrator][high] Delivered PR lifecycle gates (mergeability/checks/review) with squash-merge handling.
- [x] [dashboard][medium] Added multi-session dashboard APIs/session switching and proof artifact rendering.
