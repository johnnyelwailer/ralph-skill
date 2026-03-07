# Project TODO

## Current Phase: P1 Reliability Hardening + Devcontainer Prerequisites

### In Progress
- [x] [cli/P1] Implement `aloop status --watch` end-to-end (CLI flag wiring in `src/index.ts`, watch loop in `src/commands/status.ts`, and tests) so `start.ts` terminal monitor path is no longer broken. (priority: high, currently `start.ts` launches unsupported command path)
- [x] [review] Gate 5: `Invoke-Pester ./install.tests.ps1` currently fails at `install.tests.ps1:65`, `:78`, and `:270` because expectations still require 5 commands/prompts and omit `dashboard`; update assertions to require the new 6-command/6-prompt surface and revised summary line `(setup, start, status, dashboard, stop, steer)`. (priority: high)
- [ ] [review] Gate 5: `npm --prefix ./aloop/cli run type-check` fails with 22 TS errors (`TS7016`, `TS2339`) in `src/commands/project.ts`, `src/commands/session.ts`, `src/commands/setup.ts`, and `src/commands/setup.test.ts`; fix typing regressions so repository validation is green again. (priority: high)

### Up Next
- [x] [commands/P1] Add missing dashboard command wrappers: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md` so `/aloop:dashboard` is discoverable from both harnesses. (priority: high, spec UX parity)
- [x] [known-issues/P1] Add repo `.editorconfig` enforcing `CRLF` for `*.ps1` to prevent mixed-EOL parse failures. (priority: high, blocks reliable PowerShell edits)
- [ ] [known-issues/P1] Normalize line endings during `install.ps1` runtime copy (`loop.ps1` as CRLF, `loop.sh` as LF). (priority: high, prevents stale/corrupt installed runtime)
- [ ] [known-issues/P1] Add Git Bash/posix-path normalization in `aloop/cli/src/commands/start.ts` before launching `loop.ps1` (`/c/...` -> `C:\...`). (priority: high, Windows cross-shell reliability)
- [ ] [known-issues/P1] Add defensive posix-to-Windows path normalization in `aloop/bin/loop.ps1` parameter handling for direct invocations. (priority: medium, runtime robustness)
- [ ] [known-issues/P1] Add runtime staleness detection (`aloop update` command or explicit warning/version stamp) for `~/.aloop/bin/*` drift. (priority: medium, maintainability/safety)
- [ ] [devcontainer/P1] Perform mandatory devcontainer research and capture decisions/constraints in `RESEARCH.md` before implementation. (priority: high, required prerequisite in spec)
- [ ] [devcontainer/P1] Implement `/aloop:devcontainer` generation flow (project analysis + `.devcontainer/devcontainer.json` create/augment + provider install hooks + mount/env strategy). (priority: high, isolation boundary)
- [ ] [devcontainer/P1] Implement mandatory devcontainer verification loop (`devcontainer build/up/exec` checks with fail-fix-reverify behavior). (priority: high, acceptance gate)
- [ ] [devcontainer/P1] Add harness auto-container routing in `loop.ps1` and `loop.sh` (auto-detect `.devcontainer`, auto-`devcontainer up`, wrap provider calls with `devcontainer exec`, support `--dangerously-skip-container`). (priority: high, default secure execution)
- [ ] [devcontainer/P1] Add shared container reuse for parallel loops and ensure session worktrees are accessible inside container execution. (priority: medium, orchestrator scalability)
- [ ] [dashboard/P2] Add multi-session support (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebind. (priority: medium, operational visibility)
- [ ] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` and include proof metadata in `/api/state` + SSE payloads. (priority: medium, proof UX parity)
- [ ] [dashboard/P2] Redesign frontend to dense single-page operations view (remove view-switch workflow, keep TODO/log/health/commits concurrently visible). (priority: medium, spec UX requirement)
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` command plus persisted `orchestrator.json` skeleton state. (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Add orchestrator command wrappers (`claude/commands/aloop/orchestrate.md` + `copilot/prompts/aloop-orchestrate.prompt.md`). (priority: medium, command-surface parity)
- [ ] [orchestrator/P2] Implement orchestrator dispatch core (issue creation via `aloop gh`, dependency/wave gating, concurrency limits, child loop launch, worktree/branch mapping). (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gate engine (CI/coverage/conflicts/lint/review checks with merge/reopen/retry behavior). (priority: medium, safe integration)
- [ ] [triage/P2] Extend `aloop gh` for triage-specific operations missing today (comment listing + blocked label add/remove under policy controls). (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement comment triage loop (`actionable|needs_clarification|question|out_of_scope`) with confidence floor, processed-comment tracking, and blocked-on-human pause/resume. (priority: medium, closes feedback loop)
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, observability)
- [ ] [architecture/P3] Reconcile spec constraints (`zero npm dependencies`, `no build step`, `lib/config.mjs`) with current TS/bundled CLI path, or update spec explicitly. (priority: low, spec parity risk)
- [ ] [acceptance/P3] Add automated legacy-name guard for forbidden legacy references outside an explicit allowlist. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC acceptance sweep and refresh TODO states from verified code/tests. (priority: low, completion gate)

### Completed
- [x] [phase-0/P1] Rename legacy name → aloop in all files, directories, and commands. (priority: high)
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
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, and `stop` (dashboard still pending).
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
- [x] [security/P1] Convention-file GH request processing moved to host monitor (`aloop/cli/src/commands/dashboard.ts`), keeping loop runtimes lean per spec architecture.
- [x] [review/P1] Review prompt/docs aligned to 6 proof gates (`gates 1-6 pass`).
