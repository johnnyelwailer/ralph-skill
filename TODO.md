# Project TODO

## Current Phase: P1 CLI, Protocol, and Proof Integration

### In Progress
- [x] [security/P1] Replace `aloop/cli/src/commands/gh.ts` simulated-success logging path (`result: "success"`, fake `pr_number`) with real `gh` execution wrappers and structured response output for harness consumption. (blocks protocol + orchestrator)

### Up Next
- [x] [cli/P1] Add `aloop start` CLI command to perform full session bootstrap (resolve + session dir/meta + optional worktree + loop launch + active session registration). (foundational UX flow)
- [ ] [cli/P1] Add `aloop setup` CLI command with interactive defaults and `--non-interactive` path that wraps discover/scaffold. (CLI-first onboarding target)
- [ ] [commands/P1] Refactor `/aloop:start` and `/aloop:setup` command/prompt surfaces into thin wrappers that delegate to the new CLI subcommands. (prevents duplicated orchestration logic)
- [ ] [cli/P1] Implement `on_start` monitor behavior (`dashboard|terminal|none`, `auto_open`) and wire it from `aloop start`. (required auto-monitor experience)
- [ ] [cli/P1] Add `aloop status --watch` live refresh mode. (terminal monitoring parity)

- [ ] [proof/P1] Add `PROMPT_proof.md` template and include it in scaffold/install/template validation paths. (proof phase bootstrap)
- [ ] [proof/P1] Update `aloop/bin/loop.ps1` plan-build-review cycle from 5-step to 6-step (`plan -> build x3 -> proof -> review`) while preserving forced-phase and retry-same-phase behavior. (spec parity on Windows runtime)
- [ ] [proof/P1] Update `aloop/bin/loop.sh` to the same 6-step proof-aware cycle with behavior parity to `loop.ps1`. (spec parity on POSIX runtime)
- [ ] [proof/P1] Persist proof artifacts and `proof-manifest.json` to `~/.aloop/sessions/<id>/artifacts/iter-<N>/`, including explicit skip manifests with reasons when proof is skipped. (reviewable evidence trail)
- [ ] [proof/P1] Wire review/baseline integration so review consumes proof manifests; baseline updates occur only after review approval; rejected reviews keep prior baselines. (correct proof lifecycle)

- [ ] [protocol/P1] Implement convention-file intake in `aloop/bin/loop.ps1` (`.aloop/requests/*.json` -> `aloop gh` -> `.aloop/responses/*.json` -> archive to `.aloop/requests/processed/`). (host-side trust boundary)
- [ ] [protocol/P1] Implement matching convention-file protocol behavior in `aloop/bin/loop.sh` with ordering/response/archival parity. (cross-runtime consistency)

- [ ] [dashboard/P2] Add backend artifact endpoint `/api/artifacts/<iteration>/<filename>` with strict path safety checks. (proof artifact serving prerequisite)
- [ ] [dashboard/P2] Add multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebinding. (required for concurrent loop visibility)
- [ ] [dashboard/P2] Render proof artifacts inline (thumbnails/expand, text/code views, baseline comparison, iteration history selection). (proof UX requirement)
- [ ] [dashboard/P2] Redesign dashboard to dense single-page layout using required advanced components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`). (spec UX target)

- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` and persist decomposition/wave metadata in `orchestrator.json`. (safe orchestration entry point)
- [ ] [orchestrator/P2] Implement dispatch core (issue creation via `aloop gh`, wave gating, concurrency caps, child loop launch/worktree mapping). (fan-out execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflicts/lint + agent review) and merge/reopen/retry handling. (quality gate for parallel work)
- [ ] [orchestrator/P2] Implement user-feedback triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking. (human-in-the-loop control)
- [ ] [status/P2] Extend `aloop status` output to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (operational visibility)

- [ ] [devcontainer/P1] Complete mandatory devcontainer spec research (`code.visualstudio.com` + `containers.dev`) before implementation. (explicit prerequisite from SPEC)
- [ ] [devcontainer/P1] Add `/aloop:devcontainer` skill files for Claude and Copilot command surfaces. (entrypoint for setup flow)
- [ ] [devcontainer/P1] Implement project-aware devcontainer generation plus required verification loop (`devcontainer build/up/exec`, dependency/provider/git/mount checks). (containerized runtime setup)
- [ ] [devcontainer/P1] Implement loop runtime auto-detection of `.devcontainer/devcontainer.json` and default provider routing through `devcontainer exec`, with `--dangerously-skip-container` opt-out warnings/logging. (default sandbox behavior)
- [ ] [devcontainer/P1] Implement shared-container reuse for parallel loops (single container, multi-worktree mount strategy for `~/.aloop/sessions/`). (parallel scaling model)

- [ ] [cleanup/P3] Move or remove root-level debug script `reproduce_json_escape_issue.sh` from repo root. (repository hygiene)
- [ ] [acceptance/P3] Run a final SPEC-to-code acceptance sweep and refresh task states from verified code/test evidence. (release readiness)

### Completed
- [x] [security/P0] Hardened `aloop gh` policy boundaries in `gh.ts` (role scoping, repo enforcement, main-branch rejection, config hard-fail behavior).
- [x] [security/P0] Expanded `gh.test.ts` and raised branch coverage to >=90% for security policy/error paths.
- [x] [review] Security gate validation completed across gh policy + tests (gates 1-5 pass).
- [x] [runtime] Implemented retry-same-phase semantics in both runtimes (phase advancement only on success).
- [x] [runtime] Implemented mandatory final review gate invariant in both runtimes.
- [x] [runtime] Implemented provider health/degraded handling with persistence and test coverage in both runtimes.
- [x] [runtime] Implemented PATH hardening for provider windows in `loop.ps1` and `loop.sh` with regression tests.
- [x] [runtime] Implemented phase prerequisite checks and provider stderr capture in both runtimes.
- [x] [runtime] Added CLAUDECODE sanitization at loop entry and provider invocation boundaries.
- [x] [cli] Implemented `aloop resolve`, `discover`, `scaffold`, `dashboard`, `status`, `active`, and `stop` command behavior.
- [x] [commands] Claude and Copilot command/prompt assets exist for setup/start/status/steer/stop.
- [x] [templates] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are installed and used.
