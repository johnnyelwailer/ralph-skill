# Project TODO

## Current Phase: P1 Spec Parity Completion (Proof + Protocol + UX)

### In Progress
- [x] [review] Gate 1: Baseline updates are coupled to commit subject text (`chore(review): PASS`) in both runtimes (`loop.ps1:1435`, `loop.sh:1317`); replace fragile subject-string matching with a deterministic approval signal (e.g., a `review-verdict.json` file or exit-code convention) and keep rejection behavior unchanged. (priority: high)
- [x] [review] Gate 2: No runtime regression tests exist for baseline lifecycle in `loop.tests.ps1` or any shell test file — specifically, no tests prove baselines update on approved review or are preserved on rejected review. Add these tests. (priority: high)
- [x] [review] Gate 3: Branch-coverage evidence for newly added proof/baseline paths is missing — no tests cover `force proof`, manifest injection, or baseline update branches in either runtime; add coverage-reporting assertions so these branches are measured and meet >=80%. (priority: high)
- [ ] [review] Gate 4: `PROMPT_review.md` header says "5 quality gates" (lines 7, 17, 24) and approval text says "gates 1-5 pass" (lines 99, 101), but Gate 6 (Proof Verification) is listed at line 71; reconcile by updating to "6 quality gates" and "gates 1-6 pass" throughout. (priority: medium)

### Up Next
- [ ] [security/P1] Implement convention-file GH protocol in `loop.ps1`: process `.aloop/requests/*.json` via `aloop gh`, emit `.aloop/responses/*.json`, then archive to `.aloop/requests/processed/` in deterministic order. No implementation exists currently. (priority: high, trust-boundary requirement)
- [ ] [security/P1] Implement equivalent convention-file GH protocol in `loop.sh` with parity for ordering, response writing, archival, and audit logging. No implementation exists currently. (priority: high, cross-platform parity)
- [ ] [cli/P1] Implement `aloop status --watch` refresh mode (no `--watch` flag exists anywhere in the CLI) and ensure `aloop start` terminal monitor path uses a supported status flag. (priority: high, current start fallback references unsupported flag)
- [ ] [commands/P1] Add missing dashboard command assets: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md` as thin wrappers to `aloop dashboard`. Neither file exists. (priority: medium, command-surface parity)
- [ ] [dashboard/P2] Add secure artifact endpoint `/api/artifacts/<iteration>/<filename>` and include proof metadata in `/api/state` + SSE payloads. No artifact endpoint or proof metadata exists in dashboard code. (priority: medium, proof UX dependency)
- [ ] [dashboard/P2] Add multi-session support (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebind. No session parameter support exists in dashboard API. (priority: medium, required UX target)
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` and persisted orchestration state (`orchestrator.json`) for decomposition/wave planning without dispatch. No orchestrate command exists (only role-based policy in `aloop gh`). (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Implement orchestrator dispatch core: issue creation via `aloop gh`, dependency/wave gating, concurrency caps, child loop launch, and worktree/branch mapping. (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflicts/lint + agent review) with merge/reopen/retry handling. (priority: medium, safe integration)
- [ ] [triage/P2] Extend `aloop gh` with triage operations (`issue-comments`, `pr-comments`, blocked label add/remove) under existing policy model. No triage operations exist in `aloop gh`. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement comment triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume + processed-comment tracking. (priority: medium, closes feedback loop)
- [ ] [status/P2] Extend `aloop status` to render orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, observability)
- [ ] [devcontainer/P1] Implement `/aloop:devcontainer` skill — project analysis, `.devcontainer/devcontainer.json` generation, provider installation via postCreateCommand, `.aloop/` bind mount, and `remoteEnv`/`localEnv` auth forwarding. No devcontainer support exists. (priority: high, security/isolation boundary)
- [ ] [devcontainer/P1] Implement devcontainer verification step: `devcontainer build`, `devcontainer up`, verify deps/providers/git/mount inside container, iterate on failure until green. (priority: high, required acceptance path)
- [ ] [devcontainer/P1] Add harness auto-detection in `loop.ps1` and `loop.sh`: detect `.devcontainer/devcontainer.json`, route `Invoke-Provider`/`invoke_provider` through `devcontainer exec`, auto-start container if needed, support `--dangerously-skip-container` opt-out. (priority: high, automatic integration)
- [ ] [devcontainer/P1] Support shared container for parallel loops: first loop starts container, subsequent loops reuse it, session worktrees accessible via bind mount. (priority: medium, orchestrator dependency)
- [ ] [known-issues/P1] Add `.editorconfig` enforcing `end_of_line = crlf` for `*.ps1` files. No `.editorconfig` exists in the project (only in node_modules). (priority: medium, prevents line-ending corruption)
- [ ] [known-issues/P1] Add line-ending normalization in `install.ps1` when copying loop scripts to `~/.aloop/bin/`. (priority: medium, prevents installed runtime corruption)
- [ ] [known-issues/P1] Add path format detection/normalization in `aloop start` and `loop.ps1` for Git Bash `$HOME` → Windows-native path conversion. (priority: medium, cross-shell compatibility)
- [ ] [known-issues/P1] Implement `aloop update` command or staleness detection so installed runtime at `~/.aloop/bin/` warns when older than repo source. (priority: low, developer experience)
- [ ] [acceptance/P3] Add automated legacy-name guard (required grep semantics) to fail validation on forbidden legacy-name hits outside allowlist. No guard exists. (priority: low, release gate)
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
- [x] [templates] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_review.md`, `PROMPT_proof.md`, and `PROMPT_steer.md` are scaffolded and installed.
- [x] [runtime/P1] Upgrade both runtimes (`loop.ps1`, `loop.sh`) from 5-step to 6-step cycle (`plan -> build x3 -> proof -> review`), including cycle-position math and forced-phase/retry-same-phase compatibility.
- [x] [proof/P1] Implement proof artifact persistence per iteration (`artifacts/iter-<N>/`) and write `proof-manifest.json` (including explicit skip protocol) consumed by review.
- [x] [proof/P1] Add baseline lifecycle integration: only update baselines after approved review; preserve previous baselines on rejection.
- [x] [cleanup/P3] `.gitignore` coverage path corrected to `aloop/cli/coverage/`.
