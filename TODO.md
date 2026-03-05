# Project TODO

## Current Phase: Security Boundary + Proof Phase + CLI Flow Closure

### In Progress
- [x] Add `loop.sh` regression tests for `json_escape` covering `\n`, `\r`, `\t`, `\\`, `\"`, mixed multiline stderr, and empty input; assert both valid JSON and exact round-trip value. (priority: P1)
- [ ] Add explicit `degraded` handling in `resolve_healthy_provider` (`aloop/bin/loop.sh`): skip degraded providers with a distinct log path (`provider_skipped_degraded`), and emit actionable signal when all providers are degraded. (priority: P1)
- [ ] Add explicit `degraded` handling in `Resolve-HealthyProvider` (`aloop/bin/loop.ps1`): verify degraded skip has a distinct log event matching loop.sh parity. (priority: P1)
- [ ] Remove or relocate root-level `reproduce_json_escape_issue.sh` into a test harness so repo root has no leftover debug scripts. (priority: P3)

### Up Next
- [x] Resolve spec-vs-code architecture drift: either (a) migrate CLI/runtime surfaces to zero-dependency `.mjs` only, or (b) amend `SPEC.md` to explicitly allow the existing TypeScript/React build pipeline. This is a decision gate before more CLI/dashboard expansion. (priority: P0)
- [ ] Implement PATH hardening in `aloop/bin/loop.sh`: strip `gh` from PATH before provider invocation and restore afterward. (priority: P1)
- [ ] Implement PATH hardening in `aloop/bin/loop.ps1`: strip `gh`/`gh.exe` paths before provider invocation and restore afterward. (priority: P1)
- [ ] Add `aloop gh` command surface in `aloop/cli/aloop.mjs` with role-aware policy enforcement scaffold and audit logging hooks (`gh_operation`, `gh_operation_denied`). (priority: P1)
- [ ] Implement loop-side convention-file intake in `aloop/bin/loop.ps1`: process `.aloop/requests/*.json`, dispatch via `aloop gh`, write `.aloop/responses/*.json`, archive processed requests. (priority: P1)
- [ ] Implement loop-side convention-file intake in `aloop/bin/loop.sh` with parity to PowerShell behavior (ordering, responses, archiving). (priority: P1)
- [ ] Add missing command prompts: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. (priority: P1)
- [ ] Add `PROMPT_proof.md` template and ensure installer/scaffold paths include it where required. (priority: P1)
- [ ] Update `aloop/bin/loop.ps1` phase cycle from 5-step to 6-step: `plan -> build x3 -> proof -> review` with forced-flag compatibility. (priority: P1)
- [ ] Update `aloop/bin/loop.sh` phase cycle from 5-step to 6-step: `plan -> build x3 -> proof -> review` with matching semantics. (priority: P1)
- [ ] Implement proof artifact persistence (`~/.aloop/sessions/<id>/artifacts/iter-<N>/` + `proof-manifest.json`) in both loop scripts. (priority: P1)
- [ ] Add dashboard backend artifact endpoint (`/api/artifacts/<iteration>/<filename>`) with safe path handling. (priority: P2)
- [ ] Add dashboard artifact rendering (image preview + code/text viewer) in frontend. (priority: P2)
- [ ] Implement `aloop start` in `aloop/cli/aloop.mjs` (session creation, prompt copy, worktree/in-place option, loop launch, active session registration). (priority: P2)
- [ ] Implement `aloop setup` in `aloop/cli/aloop.mjs` as first-class discover/scaffold flow so slash prompts can delegate cleanly. (priority: P2)
- [ ] Refactor `claude/commands/aloop/start.md` and `claude/commands/aloop/setup.md` to delegate to CLI-first `aloop start`/`aloop setup` instead of procedural manual orchestration. (priority: P2)
- [ ] Add `aloop status --watch` live refresh mode (argument parsing + refresh loop + graceful exit). (priority: P2)
- [ ] Add multi-session dashboard selection (`/api/state?session=<id>`, SSE rebinding, client session picker). (priority: P2)
- [ ] Replace tabbed dashboard core view with dense single-page layout and required component usage (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`) while preserving mobile usability. (priority: P2)
- [ ] Add `aloop orchestrate --plan-only` command to persist `orchestrator.json` decomposition and wave metadata. (priority: P2)
- [ ] Implement orchestrator dispatch core (issue creation, wave gating, concurrency cap, child loop launch/worktree mapping). (priority: P2)
- [ ] Implement orchestrator PR lifecycle (checks, agent review, merge/reopen, conflict retry budget). (priority: P2)
- [ ] Implement user-feedback triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking. (priority: P2)
- [ ] Run final acceptance sweep against `SPEC.md` checkboxes and refresh TODO completion states from actual code/tests. (priority: P3)

### Completed
- [x] Core project rename to `aloop` is reflected across runtime paths, command/prompt namespaces, and install target (`~/.aloop/`).
- [x] `install.ps1` installs runtime loop scripts/templates and creates platform CLI shims (`aloop.cmd` and POSIX `aloop` wrapper).
- [x] Native `.mjs` CLI entry exists with working `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop`.
- [x] Legacy `setup-discovery.ps1` removed; setup flow is discover/scaffold-driven.
- [x] Final-review gate invariant is implemented in both loops (`tasks_marked_complete`, forced review, `final_review_approved`/`final_review_rejected`).
- [x] Retry-same-phase semantics are implemented in both loops (success-gated cycle advancement, forced-flag precedence, retry exhaustion logging).
- [x] Phase prerequisite checks (`phase_prerequisite_miss`) and provider stderr capture are implemented in both runtimes.
- [x] Provider health core exists in both loops (per-provider state files, cooldown/degraded transitions, lock retry + graceful lock-failure path).
- [x] CLAUDECODE sanitization exists at loop entry and provider invocation boundaries (and in CLI entry path).
- [x] Existing setup/start/status/steer/stop command/prompt files are present for Claude and Copilot.
- [x] `json_escape` in `loop.sh` handles `\n`, `\r`, `\t`, `\\`, `\"` and mixed multiline input.
- [x] Spec decision gate resolved: `SPEC.md` now explicitly permits the existing TypeScript/React pipeline while keeping `aloop.mjs` as the stable core CLI entrypoint.
