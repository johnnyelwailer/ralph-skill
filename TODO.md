# Project TODO

## Current Phase: P1 Reliability Hardening + Devcontainer Prerequisites

### In Progress
- [ ] [review] Gate 3: `Normalize-LoopScriptLineEndings` in `install.ps1` has 50% branch coverage (new function requires ≥90%) — add tests for the file-not-found branch (`Test-Path` returns false, expect `Write-Warning` and no file mutation) and the `$DryRun` branch (expect `Write-Host` message and no file mutation). (priority: high)
- [x] [review] Gate 5: `Invoke-Pester ./install.tests.ps1` fails because assertions at lines ~64-65, ~77-78, and ~267-270 still expect 5 commands/prompts and omit `dashboard`; update assertions to require the new 6-command/6-prompt surface and revised summary line `(setup, start, status, dashboard, stop, steer)`. (priority: high)
- [x] [review] Gate 5: `npm --prefix ./aloop/cli run type-check` fails with ~21 TS errors: 2x `TS7016` missing declaration files for `../../lib/project.mjs` and `../../lib/session.mjs` in `src/commands/project.ts` and `src/commands/session.ts`; 18x `TS2339` property-on-`never` errors in `src/commands/setup.test.ts` (scaffoldCalledOpts typed as `never`); 1x `TS2339` in `src/commands/setup.ts` line 118 (`rl` typed as `never`). Fix type annotations/narrowing. (priority: high)

### Up Next
- [x] [known-issues/P1] Normalize line endings during `install.ps1` runtime copy (`loop.ps1` as CRLF, `loop.sh` as LF). Currently `Copy-Item` and `Set-Content` use platform defaults with no explicit encoding/EOL control. (priority: high, prevents stale/corrupt installed runtime)
- [ ] [known-issues/P1] Add Git Bash/posix-path normalization in `aloop/cli/src/commands/start.ts` before launching `loop.ps1` (`/c/...` -> `C:\...`). Currently paths are passed as-is via Node `path` module with no shell-format conversion. (priority: high, Windows cross-shell reliability)
- [ ] [known-issues/P1] Add defensive posix-to-Windows path normalization in `aloop/bin/loop.ps1` parameter handling for direct invocations. Currently accepts `-PromptsDir`, `-SessionDir`, `-WorkDir` without any format conversion. (priority: medium, runtime robustness)
- [ ] [known-issues/P1] Add runtime staleness detection (`aloop update` command or explicit warning/version stamp) for `~/.aloop/bin/*` drift. No `update` command exists; `install.ps1` prints no version stamp; loop scripts don't log their version at startup. (priority: medium, maintainability/safety)
- [ ] [devcontainer/P1] Perform mandatory devcontainer research and capture decisions/constraints in `RESEARCH.md` before implementation. Must read official spec at containers.dev and VS Code docs — spec says this is non-negotiable prerequisite. (priority: high, required prerequisite in spec)
- [ ] [devcontainer/P1] Implement `/aloop:devcontainer` generation flow (project analysis + `.devcontainer/devcontainer.json` create/augment + provider install hooks + mount/env strategy). No devcontainer files or generation code exist yet. (priority: high, isolation boundary)
- [ ] [devcontainer/P1] Implement mandatory devcontainer verification loop (`devcontainer build/up/exec` checks with fail-fix-reverify behavior). (priority: high, acceptance gate)
- [ ] [devcontainer/P1] Add harness auto-container routing in `loop.ps1` and `loop.sh` (auto-detect `.devcontainer`, auto-`devcontainer up`, wrap provider calls with `devcontainer exec`, support `--dangerously-skip-container`). (priority: high, default secure execution)
- [ ] [devcontainer/P1] Add shared container reuse for parallel loops and ensure session worktrees are accessible inside container execution. (priority: medium, orchestrator scalability)
- [ ] [dashboard/P2] Add multi-session support (`/api/state?session=<id>`, `/events?session=<id>`) and frontend session switching with SSE rebind. Current backend is single-session; sidebar session cards have no click handlers. (priority: medium, operational visibility)
- [ ] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` endpoint and include proof metadata in `/api/state` + SSE payloads for inline artifact display. (priority: medium, proof UX parity)
- [ ] [dashboard/P2] Redesign frontend to dense single-page operations view (remove view-switch workflow, keep TODO/log/health/commits concurrently visible, add ResizablePanel/HoverCard/Collapsible/Command/Sonner components). (priority: medium, spec UX requirement)
- [ ] [orchestrator/P2] Add `aloop orchestrate --plan-only` command plus persisted `orchestrator.json` skeleton state. No orchestrator command or state file exists yet. (priority: medium, orchestrator foundation)
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
- [x] [phase-0/P1] Rename legacy name -> aloop in all files, directories, and commands. (priority: high)
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
- [x] [cli/P1] Implement `aloop status --watch` end-to-end (CLI flag wiring in `src/index.ts`, watch loop in `src/commands/status.ts`, and tests).
- [x] [security/P1] `aloop gh` policy model exists for child-loop vs orchestrator roles with denial logging.
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, `stop`, and `dashboard` (both Claude and Copilot).
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
- [x] [security/P1] Convention-file GH request processing moved to host monitor (`aloop/cli/src/commands/dashboard.ts`), keeping loop runtimes lean per spec architecture.
- [x] [review/P1] Review prompt/docs aligned to 6 proof gates (`gates 1-6 pass`).
- [x] [known-issues/P1] Add repo `.editorconfig` enforcing `CRLF` for `*.ps1` to prevent mixed-EOL parse failures.
