# Project TODO

## Current Phase: Runtime Hardening + Health + Final Review + Orchestrator/Security

### In Progress
- [ ] [review] Gate 2: `aloop/cli/aloop.mjs.test.mjs:641` uses a shape-only assertion (`assert.ok(parsed.config_path)`) in the new `scaffold accepts list flag with multiple values` test; replace with concrete value assertions (exact expected `config_path`, and verify generated config content includes both providers) so broken parsing fails deterministically. (priority: high)
- [x] Raise branch coverage for `aloop/cli/aloop.mjs` from 68.25% to >=80% by testing uncovered branches (relative-time hour path, cooldown/degraded formatting, dashboard dist-missing and passthrough exit, non-string error fallback). (P1)
- [x] Raise branch coverage for `aloop/cli/lib/session.mjs` from 30.77% to >=90% by covering malformed reads, health-dir read failures, non-JSON entries, Windows/non-Windows kill branches, status write skip path, and kill-failure path. (P1)

### Up Next
- [x] Update `claude/commands/aloop/{status,stop}.md` and `copilot/prompts/aloop-{status,stop}.prompt.md` to delegate to `aloop status` / `aloop stop` (with `node ~/.aloop/cli/aloop.mjs ...` fallback) instead of bespoke file/process logic. (P1)
- [ ] Implement mandatory final-review invariant in `aloop/bin/loop.ps1` for `plan-build-review`: build cannot exit directly on all `[x]`; force review next; only review approval can set completed; log `tasks_marked_complete`, `final_review_approved`, `final_review_rejected`. (P1)
- [ ] Mirror final-review invariant behavior in `aloop/bin/loop.sh` to avoid PowerShell/Bash drift. (P1)
- [ ] Implement provider health core in `aloop/bin/loop.ps1`: per-provider `~/.aloop/health/<provider>.json`, failure classification, exponential cooldown, lock retries, and round-robin skip/sleep when all providers are unavailable. (P1)
- [ ] Add provider health observability in `loop.ps1` + status surfaces: emit `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`, `all_providers_unavailable`; ensure CLI/dashboard read paths match emitted schema. (P1)
- [ ] Add focused loop regression tests for final-review forcing, steering precedence vs forced review, cooldown progression, and lock-failure graceful degradation. (P1)
- [ ] Implement `aloop gh` command surface with hardcoded role policy (child-loop vs orchestrator), forced repo/base constraints, and deny/audit logging. (P2)
- [ ] Wire convention-file GH request handling in loop harness (`.aloop/requests` -> `.aloop/responses`, archive processed requests) and delegate all GH ops through `aloop gh`. (P2)
- [ ] Add PATH sanitization around provider invocation in loop harnesses (strip `gh` for agent process, restore afterwards on success/failure). (P2)
- [ ] Implement orchestrator Phase 1 (`aloop orchestrate --plan-only`): spec decomposition output, issue creation via labels/waves, and persisted orchestrator state at `~/.aloop/sessions/<id>/orchestrator.json`. (P2)
- [ ] Implement orchestrator Phase 2/3 dispatch-monitor loop: wave gating, concurrency cap, child worktree/branch launch, child status tracking, and auto-PR creation to `agent/trunk`. (P2)
- [ ] Implement orchestrator Phase 4 review/merge policy and conflict retry flow (max two rebases, then human flag), with merge restricted to squash into `agent/trunk`. (P2)
- [ ] Extend `aloop status` output to include orchestrator tree view (orchestrator -> children -> issues/PRs). (P2)
- [ ] Resolve spec-constraint mismatch: remove or scope exception for current npm/build tooling (`aloop/cli/package.json`, dashboard toolchain) to satisfy "zero npm dependencies" and "no build step" requirements. (P2)
- [ ] Run full acceptance sweep against `SPEC.md` (Phase 0-3 + health + final-review + orchestrator + security), update checkboxes, and document any explicit deferrals. (P2)

### Completed
- [x] `aloop status`, `aloop active`, and `aloop stop <session-id>` implemented in `aloop/cli/aloop.mjs` + `aloop/cli/lib/session.mjs` with JSON/text outputs and provider-health display support.
- [x] Stop-flow correctness fixes and tests landed: failed kill now returns failure and avoids mutating `status.json`/`active.json`.
- [x] Core rename to `aloop` paths/commands is in place across runtime tree, prompts/commands, and installer destinations.
- [x] `install.ps1` targets `~/.aloop/` and creates CLI shims (`~/.aloop/bin/aloop.cmd` and `~/.aloop/bin/aloop`).
- [x] Native ESM CLI entrypoint exists at `aloop/cli/aloop.mjs` with `resolve`, `discover`, and `scaffold` backed by `.mjs` libs.
- [x] `aloop resolve` unconfigured-project contract (`config_exists=false`) is implemented with JSON/text coverage.
- [x] `lib/discover.mjs` and `lib/scaffold.mjs` replaced legacy setup-discovery flow; `setup-discovery.ps1` is deleted.
- [x] Setup/start prompt docs use CLI-first flow with `node ~/.aloop/cli/aloop.mjs` fallbacks for `discover`, `scaffold`, and `resolve`.
- [x] Parser and project/discovery test coverage expanded (`aloop/cli/lib/{config,project,discover}.test.mjs` and `aloop/cli/aloop.mjs.test.mjs`).
