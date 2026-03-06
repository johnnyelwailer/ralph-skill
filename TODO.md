# Project TODO

## Current Phase: Security Boundary Completion + Proof/Protocol Foundations

### In Progress
- [x] [review] Gate 1: `aloop/cli/src/commands/gh.ts` trusts request-payload labels for orchestrator scope checks (`includesAloopAutoLabel(payload)` in `issue-close`/`issue-comment`/`pr-comment`), which can be spoofed by an untrusted agent. Replace payload-declared labels with trusted target-label validation before allowing these operations. (priority: high)
- [x] [review] Gate 1: `aloop/cli/src/commands/gh.ts` does not force `repo` from session config on all allowed operations (`issue-create`, `issue-close`, `issue-comment`, `pr-comment`). Enforce `repo` in policy output for every allowed operation so cross-repo bypasses remain impossible when real `gh` execution is wired in. (priority: high)
- [x] [review] Gate 3: `aloop/cli/src/commands/gh.ts` branch coverage is 84.51% (<90% target for the new security module). Add tests for uncovered policy branches (missing assigned issue scope, non-numeric `issue_number`/`pr_number`, and allowed orchestrator `issue-close` path) until `gh.ts` reaches >=90% branch coverage. (priority: high)

### Up Next
- [x] [security/P0] Raise `aloop/cli/src/commands/gh.ts` branch coverage to >=90% by covering all policy and error-path branches introduced by the security hardening.
- [ ] [security/P1] Replace `gh.ts` simulated-success scaffolding with real `gh` command execution wrappers and structured result payloads for harness consumption.

- [ ] [protocol/P1] Implement convention-file intake in `aloop/bin/loop.ps1`: process `.aloop/requests/*.json` at iteration boundaries, delegate to `aloop gh`, write `.aloop/responses/*.json`, and archive processed files to `.aloop/requests/processed/`.
- [ ] [protocol/P1] Implement matching convention-file protocol behavior in `aloop/bin/loop.sh` (ordering, response semantics, and archival parity with PowerShell).

- [ ] [proof/P1] Add `PROMPT_proof.md` to templates/scaffold/install paths and require it where `plan-build-review` mode is used.
- [ ] [proof/P1] Update `aloop/bin/loop.ps1` cycle resolution from 5-step to 6-step (`plan -> build x3 -> proof -> review`) while preserving forced-phase and retry-same-phase semantics.
- [ ] [proof/P1] Update `aloop/bin/loop.sh` to the same 6-step proof-aware cycle with parity to `loop.ps1`.
- [ ] [proof/P1] Persist proof artifacts and `proof-manifest.json` to `~/.aloop/sessions/<id>/artifacts/iter-<N>/`, including explicit skip manifests when nothing is provable.
- [ ] [proof/P1] Wire proof baseline/review integration: reviewer consumes proof manifest, baselines update only on review approval, and rejected reviews preserve prior baselines.

- [ ] [ux/P1] Add missing dashboard command assets: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`.
- [ ] [cli/P1] Implement `aloop start` command (session creation, prompt copy, worktree/in-place behavior, loop launch, active-session registration).
- [ ] [cli/P1] Implement `aloop setup` as a first-class interactive discover/scaffold flow with a non-interactive flag path.
- [ ] [cli/P1] Add `aloop status --watch` live refresh mode.
- [ ] [cli/P1] Implement `on_start` monitor behavior (`dashboard|terminal|none`, `auto_open`) and auto-monitor launch from `aloop start`.

- [ ] [devcontainer/P1] Complete prerequisite research of current devcontainer spec (`code.visualstudio.com` + `containers.dev`) before implementation details are finalized.
- [ ] [devcontainer/P1] Add `/aloop:devcontainer` skill files for Claude and Copilot command surfaces.
- [ ] [devcontainer/P1] Implement project-aware devcontainer generation and mandatory verification loop (`devcontainer build/up/exec`, provider/dependency/git/mount validation).
- [ ] [devcontainer/P1] Implement harness auto-detection of `.devcontainer/devcontainer.json` in both loop runtimes and route provider invocations through `devcontainer exec` by default, with `--dangerously-skip-container` warning/logging opt-out.
- [ ] [devcontainer/P1] Implement shared-container reuse for parallel loops (single container, multiple worktrees, mount strategy for `~/.aloop/sessions/`).

- [ ] [cli/P2] Add `aloop discover --scope project|full` parity with SPEC Phase 2 schema expectations.
- [ ] [dashboard/P2] Add multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebinding.
- [ ] [dashboard/P2] Add backend artifact endpoint `/api/artifacts/<iteration>/<filename>` with strict path safety checks.
- [ ] [dashboard/P2] Redesign the dashboard to a dense single-page layout (TODO, log, health, commits, steer visible together) and use required advanced components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`).
- [ ] [dashboard/P2] Render proof artifacts inline (thumbnails/expand, text+code views, baseline comparison modes, iteration history selection).
- [ ] [commands/P2] Refactor `/aloop:start` and `/aloop:setup` command/prompt files into thin wrappers that delegate to CLI-first `aloop start` / `aloop setup`.
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` and persist decomposition/wave metadata in `orchestrator.json`.
- [ ] [orchestrator/P2] Implement orchestrator dispatch core (issue creation via `aloop gh`, wave gating, concurrency cap, child loop launch/worktree mapping).
- [ ] [orchestrator/P2] Implement orchestrator PR lifecycle gates (CI/coverage/conflicts/lint + agent review) with merge/reopen/retry handling.
- [ ] [orchestrator/P2] Implement user-feedback triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking.
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping).

- [ ] [cleanup/P3] Remove or relocate root-level `reproduce_json_escape_issue.sh` into a test harness so the repo root has no leftover debug script.
- [ ] [acceptance/P3] Run final acceptance sweep against `SPEC.md` and refresh TODO completion states from actual code/test/grep results.

### Completed
- [x] [security/P0] Expand `aloop/cli/src/commands/gh.test.ts` to cover: missing request file, invalid request JSON, unknown role, unknown operation, missing/invalid session config paths, missing `repo` in config, orchestrator label guards, and `enforced.repo` assertions on allowed paths.
- [x] [security/P0] Enforce scoped-target policy in `evaluatePolicy`: child `issue-comment` must be limited to assigned issue, child `pr-comment` to child-created PRs, and orchestrator `issue-close`/comment operations must require `aloop/auto` scope validation (not comments-only placeholders).
- [x] [security/P0] Remove scaffold fallback behavior from `aloop gh` session config loading in `aloop/cli/src/commands/gh.ts`: missing/invalid/malformed `config.json` (or missing `repo`) must hard-fail, log `gh_operation_denied`, and exit non-zero. This closes the current cross-repo trust-boundary hole.
- [x] [review] Gate 5: Restore regression baseline — `gh.test.ts` uses `vitest` (`import { describe, it, expect, ... } from 'vitest'`) while all other tests use `node:test`/`node:assert`. Rewrite `gh.test.ts` to use the existing Node test stack so `npm --prefix aloop/cli test` and `npm --prefix aloop/cli run type-check` pass.
- [x] [review] Gate 1: `evaluatePolicy` in `gh.ts` uses `payload.repo || 'owner/repo'` placeholder — never loads session config. Implement hard enforcement: load session repo from config, reject requests with mismatched repo.
- [x] [review] Gate 1: `evaluatePolicy` does not guard against `base: main` — any request can target `main` branch. Add explicit rejection of operations targeting `main` per spec ("Anything targeting main -> No -> Rejected — human promotes to main").
- [x] [review] Gate 5: Fix regression baseline. `Invoke-Pester ./aloop/bin/loop.tests.ps1` fails at discovery with parse errors, and `install.tests.ps1` has failing tests. Restored full test suite green.
- [x] [review] Gate 1: `aloop/bin/loop.sh` PATH hardening removes whole directories that contain `gh`. Reworked sanitization to block `gh` without dropping provider executables.
- [x] [review] Gate 2: `aloop/bin/loop_path_hardening.tests.sh` misses critical cases; added behavioral tests for co-located provider binary and PATH restoration on non-zero exit.
- [x] [review] Gate 3: Add coverage-capable harness/reporting for shell branch paths and ensure touched runtime logic meets >=80% branch coverage. [gates 1-5 pass]
- [x] Add PowerShell parity for degraded provider handling in `Resolve-HealthyProvider` (`provider_skipped_degraded`, `all_providers_degraded`) and add matching Pester coverage.
- [x] Implement PATH hardening in `aloop/bin/loop.ps1`: prepend gh-blocking shim directory for provider execution windows and restore PATH afterward; 7 Pester regression tests.
- [x] Implement PATH hardening in `aloop/bin/loop.sh`: remove `gh` from PATH for provider execution windows and restore afterward; add regression tests.
- [x] Fix `aloop/bin/loop.sh` RETURN-trap leakage in `invoke_provider` (trap persists beyond function return and can clobber PATH for later commands); add regression coverage.
- [x] Add `aloop gh` command surface with hardcoded role policy scaffolding and audit log events (`gh_operation`, `gh_operation_denied`).
- [x] Unify the CLI entry surface so `aloop` routes through one implementation (`aloop.mjs` vs `dist/index.js`).
- [x] Core project rename to `aloop` is reflected across runtime paths, command/prompt namespaces, and install target (`~/.aloop/`).
- [x] `install.ps1` installs runtime loop scripts/templates and creates platform CLI shims (`aloop.cmd` and POSIX `aloop` wrapper).
- [x] Native CLI entry exists with working `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop` command behavior.
- [x] Legacy `setup-discovery.ps1` was removed; setup flow is discover/scaffold-driven.
- [x] Final-review gate invariant is implemented in both loops (`tasks_marked_complete`, forced review, `final_review_approved`/`final_review_rejected`).
- [x] Retry-same-phase semantics are implemented in both loops (success-gated phase advancement, forced-flag precedence, retry exhaustion logging).
- [x] Phase prerequisite checks (`phase_prerequisite_miss`) and provider stderr capture are implemented in both runtimes.
- [x] Provider health core exists in both loops (per-provider state files, cooldown/degraded transitions, lock retry + graceful lock-failure path).
- [x] CLAUDECODE sanitization exists at loop entry and provider invocation boundaries (plus CLI entry path).
- [x] Existing setup/start/status/steer/stop command and prompt files are present for Claude and Copilot.
- [x] `json_escape` in `loop.sh` handles `\n`, `\r`, `\t`, `\\`, `\"` and mixed multiline input, with regression coverage.
- [x] `loop.sh` explicitly handles degraded providers (`provider_skipped_degraded`, `all_providers_degraded`) with behavioral tests.
- [x] Spec decision gate resolved: `SPEC.md` explicitly permits the current TypeScript/React pipeline while keeping `aloop.mjs` as stable entrypoint.
