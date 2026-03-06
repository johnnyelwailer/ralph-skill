# Project TODO

## Current Phase: P1 Spec Parity Completion (Proof + Protocol + UX)

### In Progress
- [x] [proof/P1] Add `PROMPT_proof.md` to `aloop/templates/` and wire scaffold/install/template validation + tests so proof is a first-class prompt alongside plan/build/review/steer. (priority: highest, unblocks all proof-runtime work)

### Up Next
- [x] [runtime/P1] Upgrade both runtimes (`loop.ps1`, `loop.sh`) from 5-step to 6-step cycle (`plan -> build x3 -> proof -> review`), including cycle-position math and forced-phase/retry-same-phase compatibility. (priority: highest, core behavior gap)
- [ ] [proof/P1] Implement proof artifact persistence per iteration (`artifacts/iter-<N>/`) and write `proof-manifest.json` (including explicit skip protocol) consumed by review. (priority: high, required acceptance path)
- [ ] [proof/P1] Add baseline lifecycle integration: only update baselines after approved review; preserve previous baselines on rejection. (priority: high, prevents regressions)
- [ ] [security/P1] Implement convention-file GH protocol in `loop.ps1`: process `.aloop/requests/*.json` via `aloop gh`, emit `.aloop/responses/*.json`, then archive to `.aloop/requests/processed/` in deterministic order. (priority: high, trust-boundary requirement)
- [ ] [security/P1] Implement equivalent convention-file GH protocol in `loop.sh` with parity for ordering, response writing, archival, and audit logging. (priority: high, cross-platform parity)
- [ ] [cli/P1] Implement `aloop status --watch` refresh mode and ensure `aloop start` terminal monitor path uses a supported status flag. (priority: high, current start fallback references unsupported flag)
- [ ] [commands/P1] Add missing dashboard command assets: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md` as thin wrappers to `aloop dashboard`. (priority: medium, command-surface parity)
- [ ] [dashboard/P2] Add secure artifact endpoint `/api/artifacts/<iteration>/<filename>` and include proof metadata in `/api/state` + SSE payloads. (priority: medium, proof UX dependency)
- [ ] [dashboard/P2] Add multi-session support (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebind. (priority: medium, required UX target)
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` and persisted orchestration state (`orchestrator.json`) for decomposition/wave planning without dispatch. (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Implement orchestrator dispatch core: issue creation via `aloop gh`, dependency/wave gating, concurrency caps, child loop launch, and worktree/branch mapping. (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflicts/lint + agent review) with merge/reopen/retry handling. (priority: medium, safe integration)
- [ ] [triage/P2] Extend `aloop gh` with triage operations (`issue-comments`, `pr-comments`, blocked label add/remove) under existing policy model. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement comment triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume + processed-comment tracking. (priority: medium, closes feedback loop)
- [ ] [status/P2] Extend `aloop status` to render orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, observability)
- [ ] [acceptance/P3] Add automated legacy-name guard (required grep semantics) to fail validation on forbidden legacy-name hits outside allowlist. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC-to-code acceptance sweep and refresh TODO task states from verified evidence. (priority: low, completion gate)

### Completed
- [x] [entrypoint/P1] Stable canonical CLI entrypoint restored at `aloop/cli/aloop.mjs` and aligned with install/tests/docs.
- [x] [runtime] Provider health subsystem implemented in both runtimes (cooldown/degraded/recovery + lock handling).
- [x] [runtime] Mandatory final review gate implemented for `plan-build-review`.
- [x] [runtime] Retry-same-phase semantics and prerequisite overrides implemented in both runtimes.
- [x] [runtime] PATH hardening implemented around provider calls to block agent-side direct `gh`.
- [x] [runtime] CLAUDECODE environment sanitization implemented at runtime entry and provider invocation boundaries.
- [x] [cli] Core commands implemented: `resolve`, `discover`, `scaffold`, `start`, `setup`, `dashboard`, `status`, `active`, `stop`, `gh`.
- [x] [cli] `aloop start` performs session bootstrap and supports `on_start` monitor behavior (`dashboard|terminal|none`, `auto_open`).
- [x] [security] `aloop gh` policy enforcement exists for child-loop vs orchestrator roles with denial logging.
- [x] [commands] Claude/Copilot command assets exist for `setup`, `start`, `status`, `steer`, and `stop`.
- [x] [templates] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded and installed.
- [x] [cleanup/P3] `.gitignore` coverage path corrected to `aloop/cli/coverage/`.
