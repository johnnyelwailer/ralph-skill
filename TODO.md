# Project TODO

## Current Phase: Orchestrator Pipeline E2E — Gap Closure

### In Progress

- [x] [review] Gate 4: `useIsTouchLikePointer.ts` + `useIsTouchLikePointer.test.ts` (103 lines) are dead code — zero components import `useIsTouchLikePointer`. Delete both files or consolidate with `useIsTouchDevice`. This is the SECOND review flagging this exact issue (first: Review 4, 2026-03-22 17:30). (priority: high)


### Up Next

#### Orchestrator Core (priority: critical)

- [x] Integrate `OrchestratorAdapter` into `orchestrate.ts` — adapter interface and `GitHubAdapter` exist in `adapter.ts` but orchestrate.ts still uses raw `execGh`/`github-monitor` imports directly; spec requires all GH operations go through adapter (SPEC-ADDENDUM §Orchestrator Adapter Pattern)
- [x] Branch sync before each iteration — `loop.sh` has no `git fetch`/`git merge` of base branch before iterations; worktree branches drift causing merge conflicts at PR time (SPEC §Branch Sync & Auto-Merge, SPEC-ADDENDUM §Known Gap #1)
- [x] `PROMPT_merge.md` template — exists at `aloop/templates/PROMPT_merge.md` (53 lines); used by orchestrate.ts (template registration line 3413) and process-requests.ts (merge conflict queue injection lines 315-320)
- [x] Orchestrator spawns background daemon — `orchestrateCommand` spawns `loop.sh` detached with `child.unref()`, registers in `active.json`, writes `meta.json` + `status.json` for dashboard visibility

#### Loop Engine (priority: high)

- [x] Spec-gap periodic scheduling (every 2nd cycle) not wired in loop.sh — spec-gap agent exists as finalizer element but the in-cycle periodic scheduling is missing (SPEC §Spec-Gap Analysis Agent: "runs before every 2nd plan phase")
- [x] Loop health supervisor agent missing — no `PROMPT_loop_health.md` template; no circuit breaker or pattern detection for repetitive cycling/stuck cascades (SPEC §Configurable Agent Pipeline > Loop health supervisor)
- [ ] `{{SUBAGENT_HINTS}}` template variable not resolved — loop.sh `substitute_prompt_placeholders()` (lines 285-294) only expands `SESSION_DIR`, `ITERATION`, `ARTIFACTS_DIR`; subagent hint files exist (`subagent-hints-build.md`, `subagent-hints-proof.md`, `subagent-hints-review.md`) but are never loaded or injected; need provider-conditional expansion (SPEC §Configurable Agent Pipeline > Subagent Integration)

#### QA Bugs (priority: high)

- [ ] [qa/P2] `--output json` error path outputs plain text — `withErrorHandling` wrapper (`error-handling.ts`) always emits `console.error("Error: ...")` regardless of `--output` mode; also `console.error` warning on worktree failure (orchestrate.ts:1843) pollutes JSON output. The happy path JSON output works (lines 1929-1932), but any error/warning before that point bypasses JSON formatting. (priority: high)
- [ ] [qa/P2] `aloop discover --project-root /nonexistent` returns exit 0 with empty results — `discover` succeeds against a nonexistent path instead of failing with an error; `is_git_repo: false` and empty arrays are returned, misleading the user into thinking the path is a valid project. Should validate path exists before proceeding. Tested at iter 36. (priority: high)

#### QA & Coverage (priority: high)

- [ ] QA coverage tracking enforcement — QA agent does not reliably produce structured `QA_COVERAGE.md` with parseable pipe-delimited format; priority selection algorithm (UNTESTED > FAIL > incomplete > stale) not in prompt; review Gate 10 missing (SPEC-ADDENDUM §QA Agent: Coverage-Aware Testing)
- [ ] Finalizer QA coverage gate — finalizer does not check QA_COVERAGE.md before allowing loop exit; spec requires abort if >30% UNTESTED or any FAIL features remain (SPEC-ADDENDUM §QA Coverage Enforcement at Loop Exit)

#### Dashboard (priority: medium)

- [ ] Dashboard component decomposition — AppView.tsx is 2378 lines; sub-components exist inline but not extracted to separate files; spec requires <200 LOC per file, each with test + story (SPEC-ADDENDUM §Dashboard Component Architecture)
- [ ] Storybook 8 not configured — no `.storybook/` directory exists; spec requires `@storybook/react-vite` setup with colocated stories and theme decorator (SPEC-ADDENDUM §Storybook Integration)
- [ ] Dashboard responsiveness — minimal mobile support; spec requires hamburger sidebar below 640px, fixed steer input on mobile, 44x44px tap targets, 320px viewport support (SPEC-ADDENDUM §Dashboard Responsiveness)
- [x] `aloop status --watch` terminal monitoring — status command has no `--watch` mode for auto-refreshing terminal display (SPEC §UX: Dashboard > acceptance criteria) — QA verified working at iter 35: auto-refreshes every 2s with ANSI clear

#### OpenCode / Cost (priority: medium)

- [ ] OpenRouter cost monitoring dashboard widgets — cost summary widget, per-session cost aggregation, cost-by-model breakdown, and budget warning toasts not implemented (SPEC-ADDENDUM §OpenRouter Cost Monitoring)
- [ ] OpenCode agent definitions not scaffolded by `aloop setup` — `.opencode/agents/` directory with vision-reviewer, error-analyst, code-critic agents not created during setup (SPEC-ADDENDUM §OpenCode First-Class Parity)
- [ ] Cost-aware provider routing — `cost_aware_routing` and `model_cost_preferences` config not implemented; round-robin does not consider cost (SPEC-ADDENDUM §OpenCode First-Class Parity)

#### Orchestrator Refinement (priority: medium)

- [ ] UI variant exploration — decompose agent does not create 2-3 variant sub-issues for UI features; feature flag convention not generated; `aloop setup` does not estimate `ui_variant_exploration` (SPEC §Parallel Orchestrator Mode > UI Variant Exploration, SPEC-ADDENDUM §Known Gap #4)
- [ ] Scan agent self-healing diagnostics — no `diagnostics.json` written for persistent blockers; no `ALERT.md`; stuck detection escalation missing; dashboard doesn't display blocker banners (SPEC-ADDENDUM §Scan Agent Self-Healing)
- [ ] Sandbox policy enforcement — `sandbox` field is stored in metadata but no actual container vs host enforcement logic; dispatch doesn't validate `requires` labels against host capabilities beyond basic platform check (SPEC §Per-Task Environment Requirements)

#### CLI (priority: low)

- [ ] CLI help simplification — default `aloop --help` shows all 15 commands; spec requires only 6 user-facing commands visible by default, with `--help --all` for full list (SPEC-ADDENDUM §CLI Simplification)
- [ ] Domain skill discovery (tessl integration) — P2 feature; no integration with tessl for discovering domain-specific agent skills during setup (SPEC §Domain Skill Discovery)

### Deferred

- [ ] Synthetic orchestrator test scenario — E2E test against `agent-forge` repo; requires all orchestrator features to be stable first (SPEC-ADDENDUM §Synthetic Orchestrator Test Scenario)
- [ ] `LocalAdapter` for file-based orchestration without GitHub — adapter interface exists but only `GitHubAdapter` implemented; local adapter deferred until demand (SPEC-ADDENDUM §Orchestrator Adapter Pattern)
- [ ] ZDR (Zero Data Retention) scaffold — `aloop setup` does not generate provider-specific ZDR config when `data_privacy: private` selected (SPEC §Zero Data Retention)
- [ ] Devcontainer integration — devcontainer.json generation, provider auth strategy, workspace mount handling not implemented (SPEC §Devcontainer)
- [ ] Webhook-based monitoring (instant event notification) — optional enhancement over polling; `gh webhook forward` integration (SPEC §Efficient GitHub Monitoring)

### Completed

- [x] OrchestratorAdapter interface defined in `src/lib/adapter.ts` with GitHubAdapter implementation and test suite
- [x] All 15 orchestrator prompt templates exist (`PROMPT_orch_*.md`)
- [x] `aloop gh` subcommands implemented (start, watch, status, stop, pr-create, pr-merge, issue-create, issue-close, issue-label, issue-comment, issue-comments, pr-comments, pr-comment)
- [x] process-requests command handles decomposition results, sub-decomposition, estimates, and agent convention requests
- [x] Provider health file locking in loop.sh (mkdir-based with retry backoff)
- [x] Phase prerequisites in loop.sh (build requires TODO.md tasks, review requires commits)
- [x] Retry-same-phase in loop.sh (cyclePosition stays on failure, retries with next provider)
- [x] Finalizer mode in loop.sh (finalizerPosition tracking, TODO re-check after each agent, abort on new TODOs)
- [x] `--no-task-exit` flag in loop.sh
- [x] CLAUDECODE env var sanitization (at entry and before each provider call in loop.sh)
- [x] process-requests integration in loop.sh (calls `aloop process-requests` between iterations)
- [x] Comment triage in orchestrate.ts (every 5th iteration, 4 classifications, auto-reply/steering)
- [x] Spec change detection and replan in orchestrate.ts
- [x] PR lifecycle gating (merge conflicts, CI checks, agent review, squash-merge)
- [x] Child loop monitoring (status polling, completion → PR, failure detection)
- [x] Orchestrator resumability (state JSON, dedup on preload, ETag cache)
- [x] Dispatch with concurrency cap, wave scheduling, file ownership, host capability filtering
- [x] `/aloop:dashboard` command exists in `claude/commands/aloop/`
- [x] `aloop-dashboard.prompt.md` exists in `copilot/prompts/`
- [x] CommandPalette component exists in AppView.tsx (Ctrl+K with cmdk)
- [x] ArtifactComparisonDialog with side-by-side, slider, diff-overlay modes in AppView.tsx
- [x] Provider health display in dashboard (HealthPanel in AppView.tsx)
- [x] QA_COVERAGE.md badge display in dashboard
- [x] Storybook 8 devDependencies installed and npm scripts added
- [x] useIsTouchDevice and useIsTouchLikePointer hooks with tests
- [x] Self-healing: auto-create missing labels and derive missing config (#227)
- [x] `aloop start` forwards `mode: orchestrate` to orchestrator instead of rejecting it — `startCommand` dispatches to `orchestrateCommand` when config or `--mode` resolves to orchestrate
- [x] `PROMPT_merge.md` template exists at `aloop/templates/PROMPT_merge.md` — used by orchestrate.ts and process-requests.ts for merge conflict resolution
- [x] Orchestrator spawns background daemon and returns immediately — detached `loop.sh` spawn, `active.json` registration, `meta.json` + `status.json` for dashboard
