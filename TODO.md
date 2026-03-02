# Project TODO

## Current Phase: Runtime Hardening + Health + Final Review + Orchestrator/Security

### In Progress
- [x] [review] Gate 2: `aloop/cli/aloop.mjs.test.mjs:641` uses a shape-only assertion (`assert.ok(parsed.config_path)`) in the new `scaffold accepts list flag with multiple values` test; replace with concrete value assertions (exact expected `config_path`, and verify generated config content includes both providers) so broken parsing fails deterministically. (priority: high)

### Up Next
- [x] Implement mandatory final-review invariant in `aloop/bin/loop.ps1` for `plan-build-review`: add `$script:allTasksMarkedDone` and `$script:forceReviewNext` flags; build phase sets flags instead of exiting; `Resolve-IterationMode` returns `'review'` when flag set; log `tasks_marked_complete`, `final_review_approved`, `final_review_rejected`. (P1)
- [ ] Mirror final-review invariant in `aloop/bin/loop.sh`: add `ALL_TASKS_MARKED_DONE` and `FORCE_REVIEW_NEXT` vars; `check_all_tasks_complete()` sets flags instead of `exit 0`; mode-resolution respects flag; log same events. (P1)
- [ ] Implement provider health core in `aloop/bin/loop.ps1`: `Read-ProviderHealth`/`Write-ProviderHealth` with `[System.IO.File]::Open()` locking (5 retries, progressive backoff); failure classification (rate_limit/timeout/auth/concurrent_cap/unknown); exponential cooldown table (2/5/15/30/60 min); round-robin skips cooldown/degraded providers; sleeps to earliest cooldown when all unavailable. (P1)
- [ ] Add provider health observability in `loop.ps1` + status surfaces: emit `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`, `all_providers_unavailable` to `log.jsonl`; verify `aloop status` health table reads new schema correctly. (P1)
- [ ] Mirror provider health core in `aloop/bin/loop.sh`: equivalent Bash implementation of health file read/write with flock locking, same failure classification and cooldown table, same round-robin skip/sleep behavior. (P1)
- [ ] Add focused loop regression tests for final-review forcing, steering precedence vs forced review, cooldown progression, and lock-failure graceful degradation (PowerShell Pester or Node test harness invoking loop via subprocess). (P1)
- [ ] Implement `aloop gh` subcommand in `aloop/cli/aloop.mjs` with hardcoded role policy (child-loop vs orchestrator), forced `--repo`/`--base agent/trunk` constraints, deny/audit logging to `log.jsonl` as `gh_operation` and `gh_operation_denied`. (P2)
- [ ] Wire convention-file GH request handling in `loop.ps1`: at iteration boundaries read `.aloop/requests/*.json`, delegate to `aloop gh`, write responses to `.aloop/responses/`, archive processed requests to `.aloop/requests/processed/`. (P2)
- [ ] Add PATH sanitization around provider invocation in `loop.ps1` and `loop.sh`: strip directories containing `gh`/`gh.exe` from `$env:PATH` before `Invoke-Provider`, restore in `finally` block. (P2)
- [ ] Implement orchestrator Phase 1 (`aloop orchestrate --plan-only`) in `aloop/cli/aloop.mjs`: spec decomposition via agent, issue creation via `gh issue create` with `aloop/auto`+wave labels, dependency graph, persisted state at `~/.aloop/sessions/<id>/orchestrator.json`. (P2)
- [ ] Implement orchestrator Phase 2/3 dispatch-monitor loop: wave gating (N+1 only after wave N fully merged), concurrency cap (default 3), child worktree/branch creation, child loop launch, status polling, auto-PR creation to `agent/trunk`. (P2)
- [ ] Implement orchestrator Phase 4 review/merge policy: automated gates (CI, coverage, conflicts, lint), agent review on PR diff, squash-merge to `agent/trunk`, conflict retry (max 2 rebases then human flag). (P2)
- [ ] Extend `aloop status` output to include orchestrator tree view (orchestrator → children → issues/PRs). (P2)
- [ ] Resolve spec-constraint mismatch: remove or scope exception for current npm/build tooling (`aloop/cli/package.json` has `commander` dep + TypeScript/esbuild build step for dashboard) to satisfy "zero npm dependencies" and "no build step" spec constraints. (P2)
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
- [x] Raised branch coverage for `aloop/cli/aloop.mjs` to >=80% (hour path, cooldown/degraded formatting, dashboard dist-missing, non-string error fallback).
- [x] Raised branch coverage for `aloop/cli/lib/session.mjs` to >=90% (malformed reads, health-dir failures, non-JSON entries, Windows/non-Windows kill, status write skip, kill-failure).
- [x] `claude/commands/aloop/{status,stop}.md` and `copilot/prompts/aloop-{status,stop}.prompt.md` delegate to `aloop status`/`aloop stop` CLI (confirmed — no bespoke file/process logic).
