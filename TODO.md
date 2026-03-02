# Project TODO

## Current Phase: Runtime Hardening + Security Boundary + Orchestrator Foundations

### In Progress
- [x] [review] Gate 2: `aloop/bin/loop.tests.ps1` relies heavily on static regex checks (`Should -Match`) instead of behavior validation (for example lines 15-243 and 403-487). Replace these with subprocess-driven tests that execute real loop flows and assert concrete outputs/state transitions (health JSON fields, exact log events, provider selection outcomes) so broken runtime logic fails deterministically. (priority: high)
- [x] [review] Gate 2: `aloop/bin/loop.sh` still has no behavioral final-review/provider-health regression coverage in this iteration; current assertions are source-text checks only (`aloop/bin/loop.tests.ps1:151-243`). Add end-to-end tests that run `loop.sh` in temp workdirs with fake providers and verify forced-review behavior, rejection re-plan, and health-related event emission from runtime behavior. (priority: high)
- [x] [review] Gate 3: New provider-health branches in `aloop/bin/loop.ps1` (`Open-ProviderHealthStreamWithRetry`, `Classify-ProviderFailure`, `Update-ProviderHealthOnFailure`, `Resolve-HealthyProvider` at lines 457-699) do not have branch-coverage evidence and are only statically asserted. Add measurable branch coverage reporting and tests covering auth->degraded, concurrent_cap cooldown, first-failure/no-cooldown, lock-retry exhaustion (`health_lock_failed`), cooldown-expired selection, and all-providers-unavailable sleep path until this file reaches >=80% branch coverage. (priority: high)

### Completed (recent)
- [x] Add regression tests for the final-review exit invariant in both `aloop/bin/loop.ps1` and `aloop/bin/loop.sh` (forced review after build completion, review-approval exit, review rejection re-plan, steering precedence, and required log events). (P1)

### Up Next

#### P1: Security Boundary (unimplemented — confirmed by code search)
- [x] Mirror provider-health primitives and round-robin behavior in `aloop/bin/loop.sh` using `flock` with equivalent failure classification and cooldown policy. Provider health grep in loop.sh returns 0 hits. (P1)
- [x] Add PATH sanitization around `Invoke-Provider` in `loop.ps1` (lines ~1086-1095): strip `gh`/`gh.exe` directories from `$env:PATH` before call, restore in `finally` block. Currently absent — `Invoke-Provider` is called without any PATH manipulation. (P1)
- [x] Add PATH sanitization in `loop.sh` around the provider invocation block: save `$PATH`, remove directories containing `gh`, restore after. Currently absent. (P1)
- [x] Add `aloop gh` command in `aloop/cli/aloop.mjs` with hardcoded role policy (child-loop vs orchestrator), forced `--repo`/`--base agent/trunk` constraints, and audit events (`gh_operation`, `gh_operation_denied`) logged to session `log.jsonl`. No `gh` subcommand exists in aloop.mjs. (P1)
- [x] Wire convention-file processing in `loop.ps1` for `.aloop/requests/*.json` and `.aloop/responses/*.json`: read at iteration boundaries, delegate to `aloop gh`, write responses, archive processed files to `.aloop/requests/processed/`. Currently absent in loop.ps1. (P1)
- [x] Wire convention-file processing in `loop.sh` with equivalent semantics as loop.ps1 above. (P1)

#### P2: Orchestrator (not started)
- [x] Add orchestrator state model + `aloop orchestrate --plan-only` command in `aloop/cli/aloop.mjs`: invoke agent to decompose spec into issues with dependency/wave metadata, write `orchestrator.json`, create GitHub issues via `aloop gh issue-create` with `aloop/auto` + `aloop/wave-N` labels. (P2)
- [x] Implement orchestrator dispatch/monitor loop: wave gating, concurrency cap (default 3), child worktree+branch creation (`aloop/issue-<N>`), child `loop.ps1` launch, child status polling via `status.json`, stuck-child detection. (P2)
- [x] Implement orchestrator review/merge gate: run automated gates (CI checks, coverage, mergeable, lint), invoke agent review on PR diff, squash-merge approved PRs to `agent/trunk` via `aloop gh pr-merge`, reopen rejected issues with review comments, conflict retry (max 2) then flag for human. (P2)
- [x] Extend `aloop status` to render orchestrator tree view: orchestrator → child sessions → issues → PRs, with wave/state annotations. (P2)
- [x] Implement triage-agent monitor step in orchestrator: poll new comments (`aloop gh issue-comments --since`), classify (actionable/needs_clarification/question/out_of_scope), inject steering or post reply, manage `aloop/blocked-on-human` label, skip agent-generated comments, track processed comment IDs in `orchestrator.json`. (P2)

#### P2: Constraint Drift
- [x] Resolve spec constraint drift: `aloop/cli/package.json` adds `commander` runtime dependency and a TypeScript build step (`esbuild`, `tsx`), directly violating the SPEC constraint of "zero npm dependencies, no build step, `.mjs` extension, plain JS files". Either remove the TypeScript/commander layer and re-implement those features in plain `.mjs`, or document an explicit spec amendment. (P2)

#### P2: Acceptance Sweep
- [x] Run a full acceptance sweep against `SPEC.md` (Phase 0-3 + provider health + final review gate + orchestrator + security + triage), update checkboxes, and remove stale tasks from this file. (P2)

### Completed
- [x] Core rename to `aloop` paths/commands is in place across runtime tree, installer paths, and prompt/command references.
- [x] `install.ps1` installs runtime under `~/.aloop/` and creates `aloop` CLI shims.
- [x] Native ESM CLI exists at `aloop/cli/aloop.mjs` with `resolve`, `discover`, and `scaffold` backed by `.mjs` libraries.
- [x] Legacy `setup-discovery.ps1` flow was replaced by `discover`/`scaffold`, and `setup-discovery.ps1` is removed.
- [x] `aloop status`, `aloop active`, and `aloop stop` are implemented with JSON/text output and provider-health file display.
- [x] Final-review invariant logic is implemented in both loop runtimes (`loop.ps1` and `loop.sh`) with `tasks_marked_complete`, `final_review_approved`, and `final_review_rejected` events.
- [x] Implement provider-health file primitives in `aloop/bin/loop.ps1` (`~/.aloop/health/<provider>.json`) with lock retries, safe read/write, and graceful `health_lock_failed` behavior so concurrent sessions cannot corrupt state.
- [x] Integrate provider-health decisions into PowerShell round-robin selection (cooldown/degraded skip, exponential backoff, all-providers-unavailable sleep) and emit `provider_cooldown`/`provider_recovered`/`provider_degraded`/`all_providers_unavailable` logs.
