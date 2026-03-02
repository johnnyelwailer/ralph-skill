# Project TODO

## Current Phase: Phase 3 CLI + Loop Hardening + Orchestrator/Security Foundations

### In Progress
- [ ] [review] Gate 1: `aloop stop` reports success even when process termination can fail (`aloop/cli/lib/session.mjs:140-143`, `109-120`); return a failure result when kill attempts fail and avoid marking `status.json` as `stopped` in that case. (priority: high)
- [ ] [review] Gate 2: strengthen shallow assertion in `resolveProjectRoot` test (`aloop/cli/lib/project.test.mjs:29-33`) which currently only checks for non-empty string; force a deterministic non-git fallback assertion to exact expected path. (priority: medium)
- [ ] [review] Gate 2: add error-path tests for `stop` kill failures/permission errors and malformed session/health JSON handling in `aloop/cli/aloop.mjs.test.mjs` and `aloop/cli/lib/session.mjs` tests so broken behavior fails tests. (priority: high)
- [ ] [review] Gate 3: raise branch coverage for touched CLI entrypoint `aloop/cli/aloop.mjs` from 68.25% to >=80% by testing uncovered branches (relative-time hour path, cooldown/degraded health formatting branches, dashboard dist-missing and passthrough exit paths, non-string error fallback). (priority: high)
- [ ] [review] Gate 3: raise branch coverage for new module `aloop/cli/lib/session.mjs` from 30.77% to >=90% by covering read/parse failures, health directory read errors, non-JSON files, Windows/non-Windows kill branches, missing session-dir status write skip, and kill-failure handling. (priority: high)

### Up Next
- [x] Expand CLI test coverage in `aloop/cli/aloop.mjs.test.mjs`: parser error paths (`--output` invalid, missing arg values, unknown options), help output, and concrete text-mode assertions for `resolve`/`discover`/`scaffold` plus new Phase 3 commands. (P0)
- [x] Add direct unit tests for `aloop/cli/lib/project.mjs` and broaden `aloop/cli/lib/config.test.mjs` to cover parser branches (quotes/booleans/null/numbers/empty lists/block strings/malformed lines) to remove current blind spots. (P0)
- [ ] Update `claude/commands/aloop/{status,stop}.md` and `copilot/prompts/aloop-{status,stop}.prompt.md` to delegate to `aloop status` / `aloop stop` (with `node ~/.aloop/cli/aloop.mjs ...` fallback) instead of bespoke file/process logic in prompts. (P1)
- [ ] Implement provider health subsystem in `aloop/bin/loop.ps1`: per-provider files in `~/.aloop/health/`, failure classification (`rate_limit`/`auth`/`timeout`/`concurrent_cap`/`unknown`), exponential cooldown table, lock retries, and round-robin skip/sleep behavior when all providers are unavailable. (P1)
- [ ] Add health observability in `loop.ps1`: log `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`, `all_providers_unavailable`; expose health in dashboard state/SSE and CLI status output. (P1)
- [ ] Enforce mandatory final review gate in `loop.ps1` for `plan-build-review`: add `allTasksMarkedDone` + `forceReviewNext` flow so build never exits directly on all `[x]`; review approval is the only completion path; log `tasks_marked_complete`, `final_review_approved`, `final_review_rejected`. (P1)
- [ ] Add focused regression tests for new loop invariants (forced final review, steering precedence, cooldown progression, lock-failure graceful degradation). (P1)
- [ ] Align `aloop/bin/loop.sh` with the same final-review invariant to avoid cross-shell behavioral drift (`plan-build-review` currently exits directly from build on all tasks complete). (P2)
- [ ] Implement `aloop orchestrate --plan-only` foundation: spec decomposition output + issue creation flow + persisted orchestrator state in `~/.aloop/sessions/<id>/orchestrator.json`. (P2)
- [ ] Implement orchestrator dispatch/monitor wave engine: concurrency cap, per-issue child loop launch in dedicated worktrees/branches, PR creation targeting `agent/trunk`, and retry/reopen flow for conflicts/rejections. (P2)
- [ ] Extend `aloop status` to render orchestrator tree view (orchestrator → child sessions → issues/PRs) as required by spec. (P2)
- [ ] Implement `aloop gh` policy-enforced subcommand surface (`pr-create`, `pr-comment`, `issue-comment`, orchestrator-only operations) with hardcoded role policy, forced repo/base constraints, and deny logging. (P2)
- [ ] Add convention-file GH request/response processing at loop iteration boundaries (`.aloop/requests` → `.aloop/responses`, archive processed requests), and wire harness delegation to `aloop gh`. (P2)
- [ ] Add PATH sanitization in harness execution (strip `gh` for agent invocation, restore afterward) and verify restoration on success/failure paths. (P2)
- [ ] Run full SPEC acceptance sweep (Phase 0-3 + health + final-review + orchestrator + security sections): verify measured outcomes, update SPEC.md checkboxes, and record any deferred items explicitly. (P2)

### Completed
- [x] Implement `aloop status`, `aloop active`, and `aloop stop <session-id>` in `aloop/cli/aloop.mjs` and `aloop/cli/lib/session.mjs` with JSON/text outputs from `~/.aloop/active.json`, session `status.json`, and `~/.aloop/history.json`; include provider health summary from `~/.aloop/health/<provider>.json` for `status`. (P0)
- [x] Core rename to `aloop` paths/commands is in place across runtime tree (`aloop/`), Claude commands, Copilot prompts, and installer destinations.
- [x] `install.ps1` targets `~/.aloop/` and creates CLI shims (`~/.aloop/bin/aloop.cmd` and `~/.aloop/bin/aloop`).
- [x] Native ESM entrypoint exists at `aloop/cli/aloop.mjs` with `resolve` implemented via `.mjs` libs.
- [x] `aloop resolve` unconfigured-project contract implemented (`config_exists=false`) with JSON/text coverage.
- [x] `lib/discover.mjs` and `lib/scaffold.mjs` implemented as native `.mjs` modules; `discover` handles recursive `.csproj`, `.sln`, and `docs/*.md` candidates.
- [x] Concrete `discover` assertions were added for recursive `.csproj`, docs candidate inclusion, dedup, and candidate limits in `aloop/cli/aloop.mjs.test.mjs`.
- [x] Branch coverage for `aloop/cli/lib/discover.mjs` was raised with targeted unit tests (`aloop/cli/lib/discover.test.mjs`).
- [x] Legacy `setup-discovery.ps1` is deleted and CLI delegation is native `.mjs`.
- [x] Setup/start docs include `node ~/.aloop/cli/aloop.mjs` fallback entrypoints for `discover`, `scaffold`, and `resolve`.
- [x] Installer tests enforce command/prompt entrypoint consistency and runtime destination wiring.
