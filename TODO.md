# Project TODO

## Current Phase: P1 Security + Containerization + Reliability

### In Progress

### Up Next
- [x] [security/P1] Implement convention-file GH request processor in `aloop/bin/loop.ps1` (`.aloop/requests/*.json` -> `aloop gh` -> `.aloop/responses/*.json` -> archive to `.aloop/requests/processed/`) with deterministic ordering and logging. (priority: high, trust boundary)
- [ ] [security/P1] Implement convention-file GH request processor parity in `aloop/bin/loop.sh` with the same ordering, response schema, archival, and logs. (priority: high, cross-platform parity)
- [ ] [cli/P1] Add `--watch` mode to `aloop status` and make `start.ts` terminal monitor call a supported command path; add tests for refresh behavior. (priority: high, current terminal monitor path is broken)
- [ ] [commands/P1] Add missing command wrappers: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. (priority: medium, command-surface parity)
- [ ] [devcontainer/P1] Perform mandatory devcontainer spec research (official VS Code + containers.dev docs) and record concrete decisions/constraints in `RESEARCH.md` before implementation. (priority: high, prerequisite from spec)
- [ ] [devcontainer/P1] Implement `/aloop:devcontainer` skill generation flow (project analysis, `.devcontainer/devcontainer.json` creation/augmentation, provider install hooks, `.aloop` + sessions mounts, `remoteEnv` forwarding). (priority: high, security/isolation boundary)
- [ ] [devcontainer/P1] Implement mandatory devcontainer verification loop (`devcontainer build/up/exec` checks for deps/providers/git/mount/validation commands) with fail-fix-reverify behavior. (priority: high, acceptance requirement)
- [ ] [devcontainer/P1] Add harness auto-container routing in `loop.ps1` and `loop.sh` (auto-detect `.devcontainer`, auto-`devcontainer up`, wrap provider invocations with `devcontainer exec`, support `--dangerously-skip-container`). (priority: high, default isolation behavior)
- [ ] [devcontainer/P1] Add shared-container reuse for parallel loops and ensure session worktrees are accessible from container execution context. (priority: medium, orchestrator scaling dependency)
- [ ] [known-issues/P1] Add repo `.editorconfig` enforcing CRLF for `*.ps1`. (priority: medium, prevents mixed-EOL breakage)
- [ ] [known-issues/P1] Normalize loop script line endings during `install.ps1` copy/install to `~/.aloop/bin/`. (priority: medium, prevents installed runtime parse failures)
- [ ] [known-issues/P1] Add Git Bash path normalization in `aloop/cli/src/commands/start.ts` for Windows `loop.ps1` invocation. (priority: medium, fixes `/c/...` path failures)
- [ ] [known-issues/P1] Add defensive POSIX-to-Windows path normalization in `aloop/bin/loop.ps1` parameter handling. (priority: medium, cross-shell robustness)
- [ ] [known-issues/P1] Implement runtime staleness detection (`aloop update` or warning path) so `~/.aloop/bin/*` drift is surfaced. (priority: low, maintainability)
- [ ] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` and include proof metadata in `/api/state` + SSE payloads. (priority: medium, proof UX)
- [ ] [dashboard/P2] Add multi-session dashboard support (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebind. (priority: medium, ops UX)
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` command and persisted `orchestrator.json` skeleton state. (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Implement orchestrator dispatch core (issue creation via `aloop gh`, dependency/wave gating, concurrency limits, child loop launch, worktree/branch mapping). (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gate engine (CI/coverage/conflicts/lint/review checks with merge/reopen/retry behavior). (priority: medium, safe integration)
- [ ] [triage/P2] Extend `aloop gh` with triage operations (`issue-comments`, `pr-comments`, blocked label add/remove) under policy controls. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement comment triage loop (`actionable|needs_clarification|question|out_of_scope`) with confidence floor, processed-comment tracking, and blocked-on-human pause/resume. (priority: medium, closes feedback loop)
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, observability)
- [ ] [architecture/P3] Reconcile spec constraints (`zero npm dependencies`, `no build step`, `lib/config.mjs`) with current TS/bundled CLI path; either align implementation or update spec explicitly. (priority: low, spec parity risk)
- [ ] [acceptance/P3] Add automated legacy-name guard for forbidden legacy references outside an explicit allowlist. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC acceptance sweep and refresh TODO states from verified code/tests. (priority: low, completion gate)

### Completed
- [x] [review/P1] Reconcile review docs with proof phase: update `aloop/templates/PROMPT_review.md` (and README review wording) from "5 gates / gates 1-5 pass" to "6 gates / gates 1-6 pass". (priority: high, prevents incorrect review outputs)
- [x] [entrypoint/P1] Stable canonical CLI entrypoint at `aloop/cli/aloop.mjs` is present and wired.
- [x] [runtime/P1] Provider health subsystem exists in both runtimes (cooldown/degraded/recovery + lock handling + logging).
- [x] [runtime/P1] Mandatory final review gate behavior implemented in both runtimes.
- [x] [runtime/P1] Retry-same-phase + phase prerequisites + retry exhaustion behavior implemented in both runtimes.
- [x] [runtime/P1] PATH hardening and CLAUDECODE sanitization are present around provider execution.
- [x] [runtime/P1] 6-step cycle (`plan -> build x3 -> proof -> review`) is implemented in `loop.ps1` and `loop.sh`.
- [x] [proof/P1] Proof artifact directories and `proof-manifest.json` generation are implemented.
- [x] [proof/P1] Review prompt injection for proof manifest and baseline update gating via deterministic review verdict exists.
- [x] [tests/P1] Baseline lifecycle and proof/baseline branch-coverage tests were added for runtime paths.
- [x] [cli/P1] Core commands are present: `resolve`, `discover`, `scaffold`, `start`, `setup`, `dashboard`, `status`, `active`, `stop`, `gh`.
- [x] [cli/P1] `aloop start` session bootstrap/worktree/monitor wiring is implemented.
- [x] [security/P1] `aloop gh` policy model exists for child-loop vs orchestrator roles with denial logging.
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, and `stop` (dashboard still missing).
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
