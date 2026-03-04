# Project TODO

## Current Phase: Security Boundary + Proof Phase + UX CLI Completion

### In Progress
- [ ] Add `loop.sh` provider-health behavioral coverage to match `loop.ps1` depth: cover classification, cooldown tiers, success recovery, auth->degraded, round-robin skip/sleep behavior, and lock-failure graceful path. Current tests cover final-review/retry semantics but not shell health subsystem branches. (priority: critical)
- [ ] Fix `json_escape` in `aloop/bin/loop.sh` to escape JSON control characters (`\n`, `\r`, `\t`) in provider stderr/log payloads; current implementation only escapes backslash/quote and can emit invalid JSON. (priority: high)
- [ ] Add explicit `degraded` handling in `resolve_healthy_provider` (`aloop/bin/loop.sh`): the function currently only checks for `healthy` and `cooldown` statuses — degraded providers silently fall through with no skip logic or distinct log event. Add a `degraded` branch that skips the provider and, when all providers are degraded, emits `all_providers_degraded` with actionable guidance instead of silent 60s polling via the generic `all_providers_unavailable` path. (priority: high)

### Up Next
- [ ] Implement PATH hardening in both runtimes: remove `gh`/`gh.exe` directories from PATH before provider invocation and restore afterward, enforcing the security boundary that agents cannot call GH directly. (priority: P1)
- [ ] Add `aloop gh` subcommand to `aloop/cli/aloop.mjs` with hardcoded role policy, forced `--repo`/`--base agent/trunk` constraints, and audit events (`gh_operation`, `gh_operation_denied`). (priority: P1)
- [ ] Implement convention-file request processing in `aloop/bin/loop.ps1`: read `.aloop/requests/*.json` at iteration boundaries, dispatch via `aloop gh`, write `.aloop/responses/*.json`, and archive processed requests. (priority: P1)
- [ ] Mirror convention-file processing in `aloop/bin/loop.sh` with matching ordering and archive behavior. (priority: P1)
- [ ] Introduce proof phase skeleton in both loops: add `PROMPT_proof.md`, change cycle to plan->buildx3->proof->review, and wire phase resolution/forced-flag interactions. (priority: P1)
- [ ] Implement proof artifact persistence and `proof-manifest.json` writing under `~/.aloop/sessions/<id>/artifacts/iter-<N>/`, including skip-reason support. (priority: P1)
- [ ] Extend dashboard backend/frontend for proof artifacts: add `/api/artifacts/<iteration>/<filename>` and inline artifact rendering in dashboard views. (priority: P1)
- [ ] Implement first-class `aloop start` in `aloop/cli/aloop.mjs` (session creation, optional worktree, loop launch, dashboard auto-start/browser open) so `/aloop:start` can be a thin wrapper. (priority: P2)
- [ ] Implement first-class `aloop setup` in `aloop/cli/aloop.mjs` (interactive discover+scaffold flow) so `/aloop:setup` can be a thin wrapper. (priority: P2)
- [ ] Update `claude/commands/aloop/start.md` and `claude/commands/aloop/setup.md` to delegate to CLI-only start/setup flows (remove manual multi-step orchestration logic). (priority: P2)
- [ ] Add missing dashboard command prompts: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. (priority: P2)
- [ ] Add `aloop status --watch` terminal live monitoring with refresh loop and graceful exit handling. (priority: P2)
- [ ] Redesign dashboard to dense single-page layout (TODO/log/health/commits/steer visible together) and adopt required advanced components. (priority: P2)
- [ ] Add multi-session dashboard switching (`GET /api/state?session=<id>`, SSE session rebinding, sidebar selection from `active.json`). (priority: P2)
- [ ] Add orchestrator plan-only command (`aloop orchestrate --plan-only`) with persisted `orchestrator.json` decomposition graph/waves metadata. (priority: P2)
- [ ] Implement orchestrator dispatch and PR-gate lifecycle (wave gating, concurrency cap, child worktrees, checks/review/merge/reopen paths). (priority: P2)
- [ ] Extend `aloop status` output with orchestrator tree view and shared provider-health rollup. (priority: P2)
- [ ] Implement user-feedback triage flow in orchestrator (`actionable`/`needs_clarification`/`question`/`out_of_scope`, blocked-on-human pause/resume, processed comment tracking). (priority: P2)
- [ ] Resolve CLI architecture drift versus spec constraints (zero npm deps + `.mjs` only): `aloop/cli/` currently contains `package.json`, TypeScript sources (`src/`), compiled `dist/`, and the dashboard uses React/Vite/Tailwind with npm deps — all violating the "zero npm deps, `.mjs` only, no build step" constraint. Either migrate to compliant runtime or formally amend SPEC scope. (priority: P2)
- [ ] Run final SPEC acceptance sweep: execute criteria checks, update SPEC checkbox states, and document intentional `ralph` hits inside `SPEC.md` examples. (priority: P3)

### Completed
- [x] Restore reliable test backpressure for loop runtime: `aloop/bin/loop.tests.ps1` now runs with deterministic pass/fail output in one command and no longer times out in this environment.
- [x] Core project rebrand to `aloop` is reflected across runtime paths, scripts, and command/prompt namespaces.
- [x] `install.ps1` installs runtime to `~/.aloop/` and creates platform CLI shims (`aloop.cmd` + POSIX wrapper).
- [x] Native `.mjs` CLI entry exists with implemented `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop` subcommands.
- [x] Legacy `setup-discovery.ps1` was removed; setup flow depends on `discover` + `scaffold`.
- [x] Mandatory final-review gate behavior is implemented in both loops (`tasks_marked_complete`, forced review, `final_review_approved`/`final_review_rejected`).
- [x] Retry-same-phase semantics are implemented in both loops (success-gated cycle advancement, forced-flag precedence, retry exhaustion logging).
- [x] Phase prerequisite enforcement (`phase_prerequisite_miss`) is present in both runtimes.
- [x] Provider stderr capture feeds failure classification in both runtimes.
- [x] Provider-health subsystem (per-provider files, cooldown/degraded transitions, lock retry/graceful lock-failure handling, round-robin health-aware selection) exists in both loops.
- [x] `aloop status` reports active sessions and provider health summary.
- [x] CLAUDECODE sanitization is implemented at loop entry + provider invocation (both runtimes) and CLI entry.
- [x] Existing command/prompt set for setup/start/status/steer/stop is present for both Claude and Copilot harness directories.
