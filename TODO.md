# Project TODO

## Current Phase: P1 Reliability Hardening + Devcontainer Foundations

### In Progress
- [x] [review/P1] Raise branch coverage for `Normalize-LoopScriptLineEndings` in `install.ps1` by adding tests for both missing branches: file-not-found (`Test-Path` false) and `$DryRun` no-mutation path. (priority: high, closes remaining reliability gate)
- [ ] [review] Gate 2: `install.tests.ps1:453-460` (`skips line ending mutation when in DryRun`) only asserts log output and never verifies file contents remain unchanged; extend the test to assert `loop.ps1` bytes/text are identical before/after `-DryRun` so a mutating implementation fails. (priority: high)
- [ ] [review] Gate 3: `aloop/cli/src/commands/start.ts:352-359` (`normalizeGitBashPathForWindows`) has uncovered branches in the new code path; add `start.test.ts` cases for non-POSIX passthrough (e.g., `C:\\repo\\work`) and drive-root conversion (`/c` or `/c/` => `C:\\`) and assert exact `-WorkDir`/`cwd` outputs. (priority: high)

### Up Next
- [x] [known-issues/P1] Add Git Bash/posix-path normalization in `aloop/cli/src/commands/start.ts` before PowerShell launch (`/c/...` -> `C:\\...`). (priority: high, prevents Windows cross-shell launch failures)
- [x] [known-issues/P1] Add defensive path normalization in `aloop/bin/loop.ps1` for `-PromptsDir`, `-SessionDir`, and `-WorkDir` so direct invocations tolerate POSIX-style paths. (priority: high, hardens runtime entrypoint)
- [ ] [known-issues/P1] Add runtime version stamping in `install.ps1` output and include runtime version/timestamp in `loop.ps1`/`loop.sh` `session_start` logs. (priority: medium, makes drift diagnosable)
- [ ] [known-issues/P1] Add runtime staleness warning in `aloop start` when installed runtime appears older than repo/runtime source. (priority: medium, reduces stale-runtime incidents)
- [ ] [known-issues/P1] Add `aloop update` command to refresh `~/.aloop` runtime assets from the current repo checkout. (priority: medium, gives explicit remediation path)
- [ ] [devcontainer/P1] Perform mandatory devcontainer research and capture decisions/constraints in `RESEARCH.md` from containers.dev + VS Code devcontainer docs. (priority: high, spec-mandated prerequisite)
- [ ] [devcontainer/P1] Add `/aloop:devcontainer` command surfaces (`claude/commands/aloop/devcontainer.md` and `copilot/prompts/aloop-devcontainer.prompt.md`). (priority: high, required entrypoint)
- [ ] [devcontainer/P1] Implement initial devcontainer generation flow to create/augment `.devcontainer/devcontainer.json` based on project analysis. (priority: high, isolation foundation)
- [ ] [devcontainer/P1] Add provider install hooks plus mount/env forwarding strategy in generated devcontainer config. (priority: high, container usability/security boundary)
- [ ] [devcontainer/P1] Implement verification loop (`devcontainer build`, `up`, `exec`) with fail-fix-reverify behavior. (priority: high, acceptance gate)
- [ ] [devcontainer/P1] Implement host-side auto-container routing in `loop.ps1` and `loop.sh` (detect `.devcontainer`, ensure `devcontainer up`, wrap provider calls with `devcontainer exec`, support `--dangerously-skip-container`). (priority: high, required runtime behavior)
- [ ] [devcontainer/P1] Add shared-container reuse checks (`devcontainer exec -- echo ok`) and ensure session worktrees are reachable inside container execution. (priority: medium, parallel-loop scalability)
- [ ] [dashboard/P2] Add backend multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) with session-aware state loading. (priority: medium, enables real session switching)
- [ ] [dashboard/P2] Add frontend session switching that refetches state and rebinds SSE to selected session id. (priority: medium, completes multi-session UX)
- [ ] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` endpoint and include proof artifact metadata in state/SSE payloads. (priority: medium, proof visibility contract)
- [ ] [dashboard/P2] Render proof artifacts inline in dashboard views (thumbnail/expand for images, links for files). (priority: medium, closes proof UX gap)
- [ ] [dashboard/P2] Redesign dashboard from tabbed views to dense single-page operations layout with always-visible steer input and header progress indicators. (priority: medium, aligns with spec UX intent)
- [ ] [dashboard/P2] Integrate required advanced components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`) into the new layout. (priority: medium, explicit acceptance criterion)
- [ ] [orchestrator/P2] Add `aloop orchestrate` command registration with `--plan-only` and persisted `orchestrator.json` skeleton state. (priority: medium, orchestrator foundation)
- [ ] [orchestrator/P2] Add orchestrator command wrappers (`claude/commands/aloop/orchestrate.md`, `copilot/prompts/aloop-orchestrate.prompt.md`). (priority: medium, command-surface parity)
- [ ] [orchestrator/P2] Implement issue decomposition + dependency graph + wave assignment + issue creation via `aloop gh issue-create`. (priority: medium, planning core)
- [ ] [orchestrator/P2] Implement child-loop dispatch engine with concurrency cap, per-issue worktree/branch mapping, and launch lifecycle tracking. (priority: medium, execution core)
- [ ] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflict/lint/review), with merge/reopen/retry decisions. (priority: medium, safe integration)
- [ ] [orchestrator/P2] Add orchestrator budget/final-report outputs (session budget cap, issues created/completed/failed, provider usage/cost estimates). (priority: medium, acceptance completeness)
- [ ] [triage/P2] Extend `aloop gh` with triage prerequisites: comment listing and `aloop/blocked-on-human` label add/remove under existing policy model. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement orchestrator triage classification loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with confidence floor behavior. (priority: medium, feedback processing)
- [ ] [triage/P2] Implement processed-comment tracking plus blocked-on-human pause/resume and unblocking flow in orchestrator state. (priority: medium, prevents re-triage and loop churn)
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, operational visibility)
- [ ] [architecture/P3] Reconcile spec constraints (`zero npm dependencies`, `no build step`, `lib/config.mjs`) with current TypeScript/bundled CLI architecture, or explicitly update spec. (priority: low, spec parity risk)
- [ ] [acceptance/P3] Add automated legacy-name guard for forbidden legacy references outside explicit allowlist contexts. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC acceptance sweep and refresh TODO states from verified code/tests. (priority: low, completion gate)

### Completed
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
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, `stop`, and `dashboard` in both Claude and Copilot surfaces.
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
- [x] [review/P1] Installer test suite now expects 6-command/6-prompt surfaces including `dashboard`; `Invoke-Pester ./install.tests.ps1` passes.
- [x] [review/P1] `npm --prefix ./aloop/cli run type-check` passes (previous TS7016/TS2339 regressions resolved).
- [x] [known-issues/P1] Repo `.editorconfig` enforces `CRLF` for `*.ps1`.
- [x] [known-issues/P1] `install.ps1` now normalizes installed `loop.ps1` to CRLF and `loop.sh` to LF.
