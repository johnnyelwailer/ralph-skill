# Project TODO

## Current Phase: Runtime Hardening + Security Boundary + Orchestrator Foundations

### In Progress

### Completed (recent)
- [x] Add regression tests for the final-review exit invariant in both `aloop/bin/loop.ps1` and `aloop/bin/loop.sh` (forced review after build completion, review-approval exit, review rejection re-plan, steering precedence, and required log events). (P1)

### Up Next
- [ ] Implement provider-health file primitives in `aloop/bin/loop.ps1` (`~/.aloop/health/<provider>.json`) with lock retries, safe read/write, and graceful `health_lock_failed` behavior so concurrent sessions cannot corrupt state. (P1)
- [ ] Integrate provider-health decisions into PowerShell round-robin selection (cooldown/degraded skip, exponential backoff, all-providers-unavailable sleep) and emit `provider_cooldown`/`provider_recovered`/`provider_degraded`/`all_providers_unavailable` logs. (P1)
- [ ] Mirror provider-health primitives and round-robin behavior in `aloop/bin/loop.sh` using `flock` with equivalent failure classification and cooldown policy. (P1)
- [ ] Add PATH sanitization around provider invocation in `loop.ps1` and `loop.sh` (remove `gh` from agent PATH, restore after invocation) to enforce the GH trust boundary defense-in-depth. (P1)
- [ ] Add `aloop gh` command in `aloop/cli/aloop.mjs` with hardcoded role policy (child-loop vs orchestrator), forced repo/base constraints, and audit events (`gh_operation`, `gh_operation_denied`). (P1)
- [ ] Wire convention-file processing in `loop.ps1` for `.aloop/requests/*.json` and `.aloop/responses/*.json`, including processed-archive behavior at iteration boundaries. (P1)
- [ ] Add orchestrator state model + command surface (`aloop orchestrate --plan-only`) that writes `orchestrator.json` and creates labeled issues with dependency wave metadata. (P2)
- [ ] Implement orchestrator dispatch/monitor loop (wave gating, concurrency cap, child worktree+branch launch, child status polling, and PR creation targeting `agent/trunk`). (P2)
- [ ] Implement orchestrator review/merge gate flow (checks, agent review, squash merge to `agent/trunk`, conflict retry policy) plus reopen-on-rejection behavior. (P2)
- [ ] Extend `aloop status` to render orchestrator tree view and child-loop linkage (orchestrator -> issues -> child sessions -> PRs). (P2)
- [ ] Implement triage-agent monitor step (comment polling, actionable/clarification/question/out-of-scope classification, blocked-on-human pause/unpause flow, triage log persistence). (P2)
- [ ] Resolve spec constraint drift around CLI/dashboard tooling (`package.json`, TypeScript build/dist path) to satisfy the stated zero-dependency/no-build architecture or document an explicit spec amendment. (P2)
- [ ] Run a full acceptance sweep against `SPEC.md` (Phase 0-3 + provider health + final review gate + orchestrator + security + triage), then update checkboxes and remove stale tasks. (P2)

### Completed
- [x] Core rename to `aloop` paths/commands is in place across runtime tree, installer paths, and prompt/command references.
- [x] `install.ps1` installs runtime under `~/.aloop/` and creates `aloop` CLI shims.
- [x] Native ESM CLI exists at `aloop/cli/aloop.mjs` with `resolve`, `discover`, and `scaffold` backed by `.mjs` libraries.
- [x] Legacy `setup-discovery.ps1` flow was replaced by `discover`/`scaffold`, and `setup-discovery.ps1` is removed.
- [x] `aloop status`, `aloop active`, and `aloop stop` are implemented with JSON/text output and provider-health file display.
- [x] Final-review invariant logic is implemented in both loop runtimes (`loop.ps1` and `loop.sh`) with `tasks_marked_complete`, `final_review_approved`, and `final_review_rejected` events.
