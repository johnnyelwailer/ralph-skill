# Project TODO

## Current Phase: P1 Reliability Hardening + PS 5.1 Compatibility + Devcontainer Foundations

### In Progress

### Up Next
- [x] [known-issues/P1] Add session PID lockfile (`session.lock`) in `SessionDir` with alive-check on startup; clean up in `finally`/`trap` block. Both `loop.ps1` and `loop.sh`. (priority: critical, SPEC Known Issue #5 — already implemented in both runtimes)
- [x] [known-issues/P1] Add per-iteration provider timeout and child PID tracking in `Invoke-Provider`/`invoke_provider`; kill child process tree on timeout and on loop exit via `finally`/`trap`. Both runtimes. (priority: high, SPEC Known Issue #7 — zombie provider processes accumulate)
- [x] [known-issues/P1] Add `run_id` field to every `log.jsonl` entry (generated at session start) so entries from different runs are distinguishable. Both runtimes. (priority: medium, SPEC Known Issue #6 — log never cleared between runs)
- [ ] [known-issues/P1] Add runtime version stamping in `install.ps1` output and include runtime version/timestamp in `loop.ps1`/`loop.sh` `session_start` logs. (priority: medium, SPEC Known Issue #8 — makes drift diagnosable)
- [ ] [known-issues/P1] Add runtime staleness warning in `aloop start` when installed runtime appears older than repo/runtime source. (priority: medium, reduces stale-runtime incidents)
- [ ] [known-issues/P1] Add `aloop update` command to refresh `~/.aloop` runtime assets from the current repo checkout. (priority: medium, gives explicit remediation path)
- [ ] [known-issues/P1] Add start/restart/resume session launch modes with `--mode start|restart|resume` flag; resume reads `status.json` for last iteration/phase. Both runtimes + `/aloop:start` skill. (priority: medium, SPEC Known Issue #9 — no way to resume from where left off)
- [ ] [devcontainer/P1] Implement initial devcontainer generation flow to create/augment `.devcontainer/devcontainer.json` based on project analysis (detect language/runtime/deps, generate tailored config). (priority: high, isolation foundation)
- [ ] [devcontainer/P1] Add provider install hooks (`postCreateCommand`) plus `remoteEnv`/`localEnv` auth forwarding for activated providers only; prefer `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_API_KEY` for Claude. (priority: high, container usability/security boundary)
- [ ] [devcontainer/P1] Implement verification loop (`devcontainer build`, `up`, `exec`) that checks deps/providers/git/mount and iterates on failure until green. (priority: high, acceptance gate)
- [ ] [devcontainer/P1] Implement host-side auto-container routing in `loop.ps1` and `loop.sh` (detect `.devcontainer/devcontainer.json`, ensure `devcontainer up`, wrap provider calls with `devcontainer exec`, support `--dangerously-skip-container` with visible warning + `container_bypass` log event). (priority: high, required runtime behavior)
- [ ] [devcontainer/P1] Add shared-container reuse checks (`devcontainer exec -- echo ok`) and bind-mount `~/.aloop/sessions/` so session worktrees are reachable inside container. (priority: medium, parallel-loop scalability)
- [ ] [devcontainer/P1] Handle existing `.devcontainer/` augmentation (add aloop mounts/env without overwriting user's existing config). (priority: medium, SPEC acceptance criterion)
- [ ] [dashboard/P2] Add backend multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) with session-aware state loading from `active.json`. (priority: medium, enables real session switching)
- [ ] [dashboard/P2] Add frontend session switching that refetches state and rebinds SSE to selected session id; session cards get click handlers. (priority: medium, completes multi-session UX)
- [ ] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` endpoint and include proof artifact metadata in state/SSE payloads. (priority: medium, proof visibility contract)
- [ ] [dashboard/P2] Render proof artifacts inline in dashboard views (thumbnail/expand for images, syntax-highlighted code blocks for non-image artifacts, before/after comparison widget with side-by-side/slider modes). (priority: medium, closes proof UX gap)
- [ ] [dashboard/P2] Redesign dashboard from tabbed views to dense single-page operations layout with always-visible steer input, header progress bar, and color-coded phase indicator. (priority: medium, aligns with spec UX intent)
- [ ] [dashboard/P2] Integrate required advanced components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`, `ScrollArea`, `Progress`) into the new layout. (priority: medium, explicit acceptance criterion)
- [ ] [orchestrator/P2] Add `aloop orchestrate` command registration with `--plan-only` and persisted `orchestrator.json` skeleton state. (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Add orchestrator command wrappers (`claude/commands/aloop/orchestrate.md`, `copilot/prompts/aloop-orchestrate.prompt.md`). (priority: medium, command-surface parity)
- [ ] [orchestrator/P2] Implement issue decomposition + dependency graph + wave assignment + issue creation via `aloop gh issue-create` with `aloop/auto` + wave labels. (priority: medium, planning core)
- [ ] [orchestrator/P2] Implement child-loop dispatch engine with concurrency cap (default 3), per-issue worktree/branch mapping (`aloop/issue-<N>`), and launch lifecycle tracking. (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflict/lint/review) with squash-merge to `agent/trunk`, reopen on conflict (max 2 rebase attempts), and agent review on PR diffs. (priority: medium, safe integration)
- [ ] [orchestrator/P2] Add orchestrator budget/final-report outputs (session budget cap, issues created/completed/failed, provider usage/cost estimates, coverage delta). (priority: medium, acceptance completeness)
- [ ] [triage/P2] Extend `aloop gh` with triage prerequisites: `issue-comments`/`pr-comments` listing with `--since` and `aloop/blocked-on-human` label add/remove under existing policy model. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement orchestrator triage classification loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with confidence floor (<0.7 forces `needs_clarification`). (priority: medium, feedback processing)
- [ ] [triage/P2] Implement processed-comment tracking (by ID), blocked-on-human pause/resume flow, and auto-unblock when human responds with actionable feedback. (priority: medium, prevents re-triage and loop churn)
- [ ] [pipeline/P2] Implement configurable agent pipeline (`pipeline.yml` or inline in `config.yml`) with named agents, transition rules (`onFailure: retry|goto`), and repeat counts. Default pipeline generates plan-build-review backward-compatible. (priority: medium, SPEC Configurable Agent Pipeline)
- [ ] [pipeline/P2] Add agent definitions in `.aloop/agents/` (YAML with prompt reference, provider preference, transition rules) and refactor loop script into a generic agent runner. (priority: medium, agent extensibility)
- [ ] [pipeline/P2] Add runtime pipeline mutation via host-side monitor (steering-driven insert/remove/reorder of agents; auto-inject debugger after 3 consecutive build failures). (priority: medium, dynamic pipeline control)
- [ ] [pipeline/P2] Implement guard agent pattern and escalation ladder for verification failures (restrict code-only → code+tests → escalate to review → flag-for-human). (priority: medium, self-healing verification)
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, operational visibility)
- [ ] [architecture/P3] Reconcile spec constraints (`zero npm dependencies`, `no build step`, `lib/config.mjs`) with current TypeScript/bundled CLI architecture, or explicitly update spec. (priority: low, spec parity risk)
- [ ] [acceptance/P3] Add automated legacy-name guard for forbidden legacy references outside explicit allowlist contexts. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC acceptance sweep and refresh TODO states from verified code/tests. (priority: low, completion gate)

### Completed
- [x] [review/P1] Gate 2 regression: `install.tests.ps1` assertions updated to 7 commands/7 prompts including devcontainer (already done in 7dd94c6, verified all 99 tests pass).
- [x] [review/P1] Gate 1: `install.ps1` usage output updated to include devcontainer in command-surface announcements (7 commands listed).
- [x] [review/P1] Gate 2: Devcontainer command-surface files added and installer updated.
- [x] [review/P1] Gate 5: PS 7+ null-conditional operator `?.` replaced with PS 5.1-compatible pipeline in `loop.tests.ps1`.
- [x] [review/P1] Gate 3: `ConvertTo-NativePath` branch coverage verified after PS 5.1 syntax fix.
- [x] [review/P1] Gate 2: `install.tests.ps1` DryRun test extended to assert file bytes unchanged.
- [x] [review/P1] Gate 3: `start.test.ts` cases added for non-POSIX passthrough and drive-root conversion.
- [x] [devcontainer/P1] Perform mandatory devcontainer research and capture decisions/constraints in `RESEARCH.md` from containers.dev + VS Code devcontainer docs. [reviewed: gates 1-5 pass]
- [x] [review/P1] Raise branch coverage for `Normalize-LoopScriptLineEndings` in `install.ps1` by adding tests for both missing branches: file-not-found (`Test-Path` false) and `$DryRun` no-mutation path. [reviewed: gates 2-3 pass]
- [x] [known-issues/P1] Add Git Bash/posix-path normalization in `aloop/cli/src/commands/start.ts` before PowerShell launch (`/c/...` -> `C:\\...`). [reviewed: gates 1-5 pass]
- [x] [known-issues/P1] Add defensive path normalization in `aloop/bin/loop.ps1` for `-PromptsDir`, `-SessionDir`, and `-WorkDir` so direct invocations tolerate POSIX-style paths.
- [x] [devcontainer/P1] Add `/aloop:devcontainer` command surfaces (`claude/commands/aloop/devcontainer.md` and `copilot/prompts/aloop-devcontainer.prompt.md`).
- [x] [phase-0/P1] Rename legacy name -> aloop in files, directories, and command surface.
- [x] [entrypoint/P1] Stable canonical CLI entrypoint at `aloop/cli/aloop.mjs` is present and wired.
- [x] [runtime/P1] Provider health subsystem exists in both runtimes (cooldown/degraded/recovery + lock handling + logging).
- [x] [runtime/P1] Mandatory final review gate behavior implemented in both runtimes.
- [x] [runtime/P1] Retry-same-phase + phase prerequisites + retry exhaustion behavior implemented in both runtimes.
- [x] [runtime/P1] PATH hardening and `CLAUDECODE` sanitization are present around provider execution.
- [x] [runtime/P1] 6-step cycle (`plan -> build x3 -> proof -> review`) is implemented in `loop.ps1` and `loop.sh`.
- [x] [proof/P1] Proof artifact directories and `proof-manifest.json` generation are implemented.
- [x] [proof/P1] Review prompt injection for proof manifest and baseline update gating via deterministic review verdict exists.
- [x] [tests/P1] Baseline lifecycle and proof/baseline branch-coverage tests were added for runtime paths.
- [x] [cli/P1] Core commands are present: `resolve`, `discover`, `scaffold`, `start`, `setup`, `dashboard`, `status`, `active`, `stop`, `gh`.
- [x] [cli/P1] `aloop start` session bootstrap/worktree/monitor wiring is implemented.
- [x] [cli/P1] `aloop status --watch` is wired end-to-end in CLI + command implementation + tests.
- [x] [security/P1] `aloop gh` policy model exists for child-loop vs orchestrator roles with denial logging.
- [x] [security/P1] Convention-file GH request processing is host-side in `aloop/cli/src/commands/dashboard.ts`, and requests are archived after processing.
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, `stop`, `dashboard`, and `devcontainer` in both Claude and Copilot surfaces.
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
- [x] [review/P1] `npm --prefix ./aloop/cli run type-check` passes (previous TS7016/TS2339 regressions resolved).
- [x] [known-issues/P1] Repo `.editorconfig` enforces `CRLF` for `*.ps1`.
- [x] [known-issues/P1] `install.ps1` now normalizes installed `loop.ps1` to CRLF and `loop.sh` to LF.
