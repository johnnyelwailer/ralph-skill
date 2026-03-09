# Project TODO

## Current Phase: P2 Dashboard UX + Orchestrator + GitHub Integration + Pipeline

### In Progress
_(none)_

### Up Next

#### Orchestrator Execution Core (foundational — blocks triage, GH integration, and status tree)
- [x] [orchestrator/P2] Implement child-loop dispatch engine with concurrency cap (default 3), per-issue worktree/branch mapping (`aloop/issue-<N>`), and launch lifecycle tracking. (priority: medium, execution core)
- [x] [orchestrator/P2] Implement PR lifecycle gates (CI/coverage/conflict/lint/review) with squash-merge to `agent/trunk`, reopen on conflict (max 2 rebase attempts), and agent review on PR diffs. (priority: medium, safe integration)
- [ ] [orchestrator/P2] Add orchestrator budget/final-report outputs (session budget cap, issues created/completed/failed, provider usage/cost estimates, coverage delta). (priority: medium, acceptance completeness)

#### Triage Agent (depends on orchestrator dispatch for end-to-end flow)
- [ ] [triage/P2] Extend `aloop gh` with triage prerequisites: `issue-comments`/`pr-comments` listing with `--since` and `aloop/blocked-on-human` label add/remove under existing policy model. (priority: medium, triage prerequisite)
- [ ] [triage/P2] Implement orchestrator triage classification loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with confidence floor (<0.7 forces `needs_clarification`). (priority: medium, feedback processing)
- [ ] [triage/P2] Implement processed-comment tracking (by ID), blocked-on-human pause/resume flow, and auto-unblock when human responds with actionable feedback. (priority: medium, prevents re-triage and loop churn)

#### Configurable Agent Pipeline (independent track — can be parallelized with orchestrator work)
- [ ] [pipeline/P2] Implement configurable agent pipeline (`pipeline.yml` or inline in `config.yml`) with named agents, transition rules (`onFailure: retry|goto`), and repeat counts. Default pipeline generates plan-build-review backward-compatible. (priority: medium, SPEC Configurable Agent Pipeline)
- [ ] [pipeline/P2] Add agent definitions in `.aloop/agents/` (YAML with prompt reference, provider preference, transition rules) and refactor loop script into a generic agent runner. (priority: medium, agent extensibility)
- [ ] [pipeline/P2] Add runtime pipeline mutation via host-side monitor (steering-driven insert/remove/reorder of agents; auto-inject debugger after 3 consecutive build failures). (priority: medium, dynamic pipeline control)
- [ ] [pipeline/P2] Implement guard agent pattern and escalation ladder for verification failures (restrict code-only → code+tests → escalate to review → flag-for-human). (priority: medium, self-healing verification)

#### GitHub-Integrated Workflows (depends on orchestrator dispatch + triage)
- [ ] [gh/P2] Implement `aloop gh start --issue <N>` that fetches issue, creates branch/session/worktree, runs loop, creates PR on completion with `Closes #N` link + summary comment. (priority: medium, issue-driven workflow)
- [ ] [gh/P2] Implement `aloop gh watch` event-driven daemon that polls for matching issues (by label/assignee/milestone) and auto-spawns loops with `--max-concurrent` cap and `watch.json` state tracking. (priority: medium, automated issue processing)
- [ ] [gh/P2] Implement `aloop gh status` showing issue→loop→PR mapping with feedback status, and `aloop gh stop` for cleanly stopping GH-linked loops. (priority: medium, GH operational visibility)
- [ ] [gh/P2] Implement PR feedback loop in `aloop gh watch`: detect review comments and CI failures on PRs, re-iterate with feedback as steering, max feedback iterations configurable. (priority: medium, self-healing PR cycle)

#### Operational Visibility (depends on orchestrator dispatch for tree data)
- [ ] [status/P2] Extend `aloop status` to show orchestrator tree state (orchestrator -> child sessions -> issue/PR mapping). (priority: medium, operational visibility)

#### P3 — Spec Parity & Acceptance
- [ ] [architecture/P3] Reconcile spec constraints (`zero npm dependencies`, `no build step`, `lib/config.mjs`) with current TypeScript/bundled CLI architecture, or explicitly update spec. (priority: low, spec parity risk)
- [ ] [acceptance/P3] Add automated legacy-name guard for forbidden legacy references outside explicit allowlist contexts. (priority: low, release gate)
- [ ] [acceptance/P3] Run final SPEC acceptance sweep and refresh TODO states from verified code/tests. (priority: low, completion gate)

### Completed
- [x] [review/P2] Gate 3: `orchestrateCommand` (orchestrate.ts:132-159) — 8 tests added covering text/JSON output modes and conditional display of filter_issues, filter_label, filter_repo.
- [x] [orchestrator/P2] Add orchestrator command wrappers (`claude/commands/aloop/orchestrate.md`, `copilot/prompts/aloop-orchestrate.prompt.md`). (priority: medium, command-surface parity)
- [x] [orchestrator/P2] Implement issue decomposition + dependency graph + wave assignment + issue creation via `aloop gh issue-create` with `aloop/auto` + wave labels. (priority: medium, planning core) [reviewed: gates 1-5 pass]
- [x] [review/P2] Gate 1: Phase colors in `App.tsx:84-97` fixed to match spec (`plan=purple, build=yellow, review=cyan`).
- [x] [review/P2] Gate 3: `parseTodoProgress` extracted to testable module with unit tests (empty, no tasks, mixed, uppercase `[X]`).
- [x] [orchestrator/P2] Add `aloop orchestrate` command registration with `--plan-only` and persisted `orchestrator.json` skeleton state.
- [x] [dashboard/P2] Render proof artifacts inline in dashboard views (thumbnail/expand for images, syntax-highlighted code blocks for non-image artifacts, before/after comparison widget with side-by-side/slider modes). (priority: medium, closes proof UX gap)
- [x] [dashboard/P2] Redesign dashboard from tabbed views to dense single-page operations layout with always-visible steer input, header progress bar, and color-coded phase indicator. (priority: medium, aligns with spec UX intent)
- [x] [dashboard/P2] Integrate required advanced components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`, `ScrollArea`, `Progress`) into the new layout. (priority: medium, explicit acceptance criterion)
- [x] [review/P2] Gate 3: `resolveSessionContext` (dashboard.ts:121-137) — 4 untested branches covered.
- [x] [devcontainer/P1] Add provider install hooks (`postCreateCommand`) plus `remoteEnv`/`localEnv` auth forwarding for activated providers only.
- [x] [devcontainer/P1] Implement verification loop (`devcontainer build`, `up`, `exec`) that checks deps/providers/git/mount and iterates on failure until green.
- [x] [devcontainer/P1] Implement host-side auto-container routing in `loop.ps1` and `loop.sh` (detect `.devcontainer/devcontainer.json`, ensure `devcontainer up`, wrap provider calls with `devcontainer exec`, support `--dangerously-skip-container`).
- [x] [devcontainer/P1] Bind-mount `~/.aloop/sessions/` in devcontainer config so session worktrees are reachable inside container.
- [x] [dashboard/P2] Add backend multi-session APIs (`/api/state?session=<id>`, `/events?session=<id>`) with session-aware state loading from `active.json`.
- [x] [dashboard/P2] Add frontend session switching that refetches state and rebinds SSE to selected session id; session cards get click handlers.
- [x] [dashboard/P2] Add `/api/artifacts/<iteration>/<filename>` endpoint and include proof artifact metadata in state/SSE payloads. [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 3: `Initialize-DevcontainerRouting` (loop.ps1:98-147) and `initialize_devcontainer_routing` (loop.sh:118-160) — the "devcontainer CLI not found on PATH" branch is untested. Add a test for each runtime that creates `devcontainer.json`, ensures PATH has no `devcontainer` binary, and asserts the warning message about CLI not found. (priority: high)
- [x] [review/P1] Gate 3: `detectNodeInstallCommand` (devcontainer.ts:111-116) has 4 branches (pnpm/yarn/bun/npm) with zero direct test coverage — add unit tests or refactor to accept injected `existsSync` so branches are testable. (priority: high) [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 3: `detectPythonInstallCommand` (devcontainer.ts:118-122) has 3 branches with zero direct test coverage — same fix needed. (priority: high) [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 3: `devcontainerCommand` (devcontainer.ts:288-314) text/json output wrapper has zero test coverage — add tests for both output modes and both action types. (priority: medium) [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 3: `mergeArrayUnique` dedup branch (devcontainer.ts:164) not tested — add test with duplicate mount entry to exercise the `includes` guard. (priority: medium) [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 2: `devcontainer.test.ts` lines 47, 50-51 use `assert.ok` existence/truthy checks — rewrite to assert exact values. [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 2: `devcontainer.test.ts` node-typescript test and python test assert `postCreateCommand` value. [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 2: Error-path test for `devcontainerCommandWithDeps` when existing `devcontainer.json` contains invalid JSON. [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 4: JSONC comment-stripping regex replaced with `stripJsoncComments()` state-machine that respects quoted strings. [reviewed: gates 1-5 pass]
- [x] [review/P1] Gate 2 regression: `install.tests.ps1` assertions updated to 7 commands/7 prompts including devcontainer.
- [x] [review/P1] Gate 1: `install.ps1` usage output updated to include devcontainer in command-surface announcements.
- [x] [review/P1] Gate 2: Devcontainer command-surface files added and installer updated.
- [x] [review/P1] Gate 5: PS 7+ null-conditional operator `?.` replaced with PS 5.1-compatible pipeline in `loop.tests.ps1`.
- [x] [review/P1] Gate 3: `ConvertTo-NativePath` branch coverage verified after PS 5.1 syntax fix.
- [x] [review/P1] Gate 2: `install.tests.ps1` DryRun test extended to assert file bytes unchanged.
- [x] [review/P1] Gate 3: `start.test.ts` cases added for non-POSIX passthrough and drive-root conversion.
- [x] [review/P1] Raise branch coverage for `Normalize-LoopScriptLineEndings` in `install.ps1`. [reviewed: gates 2-3 pass]
- [x] [devcontainer/P1] Perform mandatory devcontainer research and capture decisions/constraints in `RESEARCH.md`. [reviewed: gates 1-5 pass]
- [x] [devcontainer/P1] Implement initial devcontainer generation flow to create/augment `.devcontainer/devcontainer.json` based on project analysis. [reviewed: gates 1-5 pass]
- [x] [devcontainer/P1] Handle existing `.devcontainer/` augmentation (add aloop mounts/env without overwriting user's existing config) — `augmentExistingConfig()` implemented with merge tests.
- [x] [devcontainer/P1] Add `/aloop:devcontainer` command surfaces (`claude/commands/aloop/devcontainer.md` and `copilot/prompts/aloop-devcontainer.prompt.md`).
- [x] [known-issues/P1] Add Git Bash/posix-path normalization in `aloop/cli/src/commands/start.ts`. [reviewed: gates 1-5 pass]
- [x] [known-issues/P1] Add defensive path normalization in `aloop/bin/loop.ps1` for POSIX-style paths.
- [x] [known-issues/P1] Add session PID lockfile (`session.lock`) in `SessionDir` with alive-check on startup.
- [x] [known-issues/P1] Add per-iteration provider timeout and child PID tracking in `Invoke-Provider`/`invoke_provider`.
- [x] [known-issues/P1] Add `run_id` field to every `log.jsonl` entry.
- [x] [known-issues/P1] Add runtime version stamping in `install.ps1` output and loop script `session_start` logs.
- [x] [known-issues/P1] Add runtime staleness warning in `aloop start`.
- [x] [known-issues/P1] Add `aloop update` command to refresh `~/.aloop` runtime assets.
- [x] [known-issues/P1] Add start/restart/resume session launch modes with `--mode start|restart|resume` flag.
- [x] [phase-0/P1] Rename legacy name -> aloop in files, directories, and command surface.
- [x] [entrypoint/P1] Stable canonical CLI entrypoint at `aloop/cli/aloop.mjs` is present and wired.
- [x] [runtime/P1] Provider health subsystem exists in both runtimes.
- [x] [runtime/P1] Mandatory final review gate behavior implemented in both runtimes.
- [x] [runtime/P1] Retry-same-phase + phase prerequisites + retry exhaustion behavior implemented.
- [x] [runtime/P1] PATH hardening and `CLAUDECODE` sanitization are present around provider execution.
- [x] [runtime/P1] 6-step cycle (`plan -> build x3 -> proof -> review`) is implemented.
- [x] [proof/P1] Proof artifact directories and `proof-manifest.json` generation are implemented.
- [x] [proof/P1] Review prompt injection for proof manifest and baseline update gating exists.
- [x] [tests/P1] Baseline lifecycle and proof/baseline branch-coverage tests were added.
- [x] [cli/P1] Core commands are present: `resolve`, `discover`, `scaffold`, `start`, `setup`, `dashboard`, `status`, `active`, `stop`, `gh`.
- [x] [cli/P1] `aloop start` session bootstrap/worktree/monitor wiring is implemented.
- [x] [cli/P1] `aloop status --watch` is wired end-to-end.
- [x] [security/P1] `aloop gh` policy model exists for child-loop vs orchestrator roles with denial logging.
- [x] [security/P1] Convention-file GH request processing is host-side, requests are archived after processing.
- [x] [commands/P1] Command assets exist for `setup`, `start`, `status`, `steer`, `stop`, `dashboard`, and `devcontainer`.
- [x] [templates/P1] `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, and `PROMPT_steer.md` are scaffolded.
- [x] [review/P1] `npm --prefix ./aloop/cli run type-check` passes.
- [x] [known-issues/P1] Repo `.editorconfig` enforces `CRLF` for `*.ps1`.
- [x] [known-issues/P1] `install.ps1` now normalizes installed `loop.ps1` to CRLF and `loop.sh` to LF.
