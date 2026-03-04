# Project TODO

## Current Phase: Runtime Semantics + Security Boundary + Orchestrator Buildout

### In Progress
- [x] Implement retry-same-phase semantics in `aloop/bin/loop.ps1` using a success-driven cycle position (not raw iteration modulo), with forced-flag precedence, phase prerequisites, and max phase-retry safety valve. This fixes build/review running without required context after failures. (P1)

### Up Next
- [x] Mirror the retry-same-phase model in `aloop/bin/loop.sh` (same semantics as PowerShell) so both runtimes behave identically in `plan-build-review`. (P1)
- [ ] Add phase-prerequisite enforcement + logs in both runtimes (`phase_prerequisite_miss`): build requires unchecked TODO tasks; review requires builds since last plan. (P1)
- [ ] Capture and persist provider stderr details on failure in both runtimes so health classification and debugging are based on real error text, not exit code alone. (P1)
- [ ] Implement provider-health subsystem parity in `aloop/bin/loop.sh` (`~/.aloop/health/<provider>.json`, cooldown/degraded transitions, all-providers-unavailable sleep, lock-failure graceful path). Currently only `loop.ps1` has this. (P1)
- [ ] Add PATH sanitization around provider execution in both runtimes (strip `gh`/`gh.exe` for agent process, then restore). Required by the security model and currently absent. (P1)
- [ ] Add `aloop gh` subcommand to `aloop/cli/aloop.mjs` with hardcoded child-loop vs orchestrator policy, forced repo/base constraints, and audit events (`gh_operation`, `gh_operation_denied`). Command is currently missing. (P1)
- [ ] Implement convention-file request/response processing in `loop.ps1` (`.aloop/requests/*.json` -> `aloop gh` -> `.aloop/responses/*.json` + archive processed files). (P1)
- [ ] Implement equivalent convention-file processing in `loop.sh` with matching behavior and ordering guarantees. (P1)
- [ ] Build `aloop orchestrate --plan-only` and persist orchestrator state (`orchestrator.json`) including issue decomposition, dependency graph, and wave metadata. (P2)
- [ ] Add orchestrator dispatch loop: wave gating, concurrency cap, child worktree/branch creation, child loop launch, and child status polling. (P2)
- [ ] Add orchestrator PR gate: automated checks + agent review + squash merge to `agent/trunk`, plus rejection/conflict handling workflow. (P2)
- [ ] Extend `aloop status` with orchestrator tree view (orchestrator -> children -> issues -> PRs) and provider-health summary integration. (P2)
- [ ] Implement user-feedback triage flow in orchestrator (classify comments, steer or clarify, blocked-on-human pause/resume, processed comment tracking). (P2)
- [ ] Resolve CLI constraint drift versus spec: repo currently contains `aloop/cli/package.json`, `commander`, TypeScript, and build artifacts; either migrate fully to zero-dependency `.mjs` CLI path or formally amend spec. (P2)
- [ ] Run an acceptance sweep against all SPEC acceptance criteria and update this TODO plus SPEC checkboxes based on measured results. Include explicit handling for the Phase 0 legacy-name grep criterion conflict with spec text/examples. (P2)

### Completed
- [x] Core rename to `aloop` paths/commands is in place across runtime tree, installer paths, and prompt/command references.
- [x] `install.ps1` installs runtime under `~/.aloop/` and creates `aloop` CLI shims.
- [x] Native ESM CLI entry exists at `aloop/cli/aloop.mjs` with `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop`.
- [x] Legacy `setup-discovery.ps1` was removed and setup flow now uses `discover`/`scaffold`.
- [x] Final-review completion gate behavior exists in both loops (`tasks_marked_complete`, `final_review_approved`, `final_review_rejected`).
- [x] Provider health primitives and round-robin health-aware selection are implemented in `aloop/bin/loop.ps1`.
