# Project TODO

## Current Phase: P1 Spec Parity Foundations (Entrypoint, Protocol, Proof, UX)

### In Progress

### Up Next
- [x] [cli/P1] Make `aloop resolve` return a clear failure for unconfigured projects (or formally align callers/tests to accepted behavior) so Phase 1 acceptance is explicit and testable.
- [ ] [commands/P1] Refactor `/aloop:start` command/prompt assets into thin wrappers that delegate to `aloop start` with minimal argument translation.
- [ ] [commands/P1] Refactor `/aloop:setup` command/prompt assets into thin wrappers that delegate to `aloop setup`.
- [ ] [commands/P1] Add `/aloop:dashboard` command asset (`claude/commands/aloop/dashboard.md`) and Copilot prompt asset (`copilot/prompts/aloop-dashboard.prompt.md`).
- [ ] [cli/P1] Implement `aloop status --watch` auto-refresh mode and keep `aloop start` terminal-monitor fallback wired to this supported flag.
- [ ] [security/P1] Implement convention-file GH protocol in `loop.ps1` (`.aloop/requests/*.json` -> `aloop gh` -> `.aloop/responses/*.json` -> archive to `.aloop/requests/processed/`) at iteration boundaries.
- [ ] [security/P1] Implement matching convention-file GH protocol behavior in `loop.sh` with ordering, response, archival, and logging parity.
- [ ] [proof/P1] Add `PROMPT_proof.md` and include it in scaffold/template/install validation paths.
- [ ] [runtime/P1] Upgrade loop cycle in both runtimes from 5-step to 6-step (`plan -> build x3 -> proof -> review`) while preserving forced-phase and retry-same-phase behavior.
- [ ] [proof/P1] Persist proof artifacts and `proof-manifest.json` under `~/.aloop/sessions/<id>/artifacts/iter-<N>/`, including explicit skip manifests.
- [ ] [proof/P1] Wire baseline lifecycle and review integration so review consumes proof manifests, baselines update only after approval, and rejection keeps prior baselines.
- [ ] [dashboard/P2] Add secure artifact serving endpoint `/api/artifacts/<iteration>/<filename>` and expose proof metadata in dashboard state/events.
- [ ] [dashboard/P2] Add multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) plus frontend session switching with SSE rebinding.
- [ ] [dashboard/P2] Redesign dashboard to a dense single-page view (TODO/log/health/commits + always-visible steer + progress/phase header) using required components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`).
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` and persist decomposition/wave state in `orchestrator.json`.
- [ ] [orchestrator/P2] Implement orchestrator dispatch core (issue creation via `aloop gh`, dependency/wave gating, concurrency cap, child loop launch/worktree mapping).
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflicts/lint + agent review) with merge/reopen/retry handling.
- [ ] [triage/P2] Extend `aloop gh` with orchestrator-safe comment polling and label operations required for triage (`issue-comments`, `pr-comments`, blocked label add/remove).
- [ ] [triage/P2] Implement comment triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking.
- [ ] [status/P2] Extend `aloop status` to render orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping).
- [ ] [acceptance/P3] Add/automate the legacy-name guard using required grep pipeline semantics so validation fails on forbidden legacy-name hits outside allowed files.
- [x] [cleanup/P3] Fix stale `.gitignore` path for CLI coverage folder to `aloop/cli/coverage/`.
- [ ] [acceptance/P3] Run final SPEC-to-code acceptance sweep and refresh task states from verified evidence.

### Completed
- [x] [entrypoint/P1] Restore the stable `aloop/cli/aloop.mjs` entrypoint as the canonical runtime surface, and align install shims/tests/docs to invoke it while keeping the TypeScript build pipeline. (required by SPEC constraints and CLAUDECODE entrypoint acceptance)
- [x] [runtime] Provider health subsystem implemented in both runtimes (per-provider health files, cooldown/degraded/recovery logging, lock-failure graceful handling).
- [x] [runtime] Mandatory final review gate invariant implemented (build completion forces review in `plan-build-review`).
- [x] [runtime] Retry-same-phase semantics and prerequisite overrides implemented in both runtimes.
- [x] [runtime] PATH hardening implemented around provider calls so agent-side `gh` is blocked and PATH is restored after execution.
- [x] [runtime] CLAUDECODE sanitization implemented at loop runtime entry and provider invocation boundaries.
- [x] [cli] Core commands implemented: `resolve`, `discover`, `scaffold`, `start`, `setup`, `dashboard`, `status`, `active`, `stop`.
- [x] [cli] `aloop start` performs full session bootstrap and supports `on_start` monitor behavior (`dashboard|terminal|none`, `auto_open`).
- [x] [security] `aloop gh` policy enforcement implemented for child-loop vs orchestrator roles, including denied-operation logging.
- [x] [commands] Claude/Copilot assets exist for `setup`, `start`, `status`, `steer`, and `stop`.
- [x] [templates] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded and installed.
