# Project TODO

## Current Phase: Orchestrator Pipeline E2E — Gap Closure

### In Progress

(none — pick from Up Next)

### Up Next

#### QA Bugs (priority: high)

- [x] [qa/P2] `aloop discover --project-root /nonexistent` returns exit 0 with empty results — fixed: `resolveProjectRoot()` now validates path exists via `existsSync()` before proceeding; throws clear error that propagates through `withErrorHandling` to exit non-zero
- [ ] [qa/P2] `aloop setup` crashes with exit 13 in non-TTY environments — `readline.createInterface()` (setup.ts:289) called without checking `process.stdin.isTTY`. Should detect non-TTY and fall back to `--non-interactive` defaults or print a helpful error. (priority: high)
- [ ] [qa/P2] `aloop setup` missing `--output json` option — CLI registration in index.ts (lines 43-53) lacks `--output` option unlike other commands (e.g., scaffold at line 70). Should add `.option('--output <mode>')` to setup command. (priority: high)

#### QA & Coverage (priority: high)

- [ ] QA coverage tracking enforcement — QA prompt (qa.md) has basic priority ordering ("never → completed → failed") but lacks full SPEC algorithm (UNTESTED > FAIL > incomplete > stale); review Gate 10 for QA coverage not defined (only Gates 1-9 exist in review.md). Pipe-delimited format IS in the prompt. (SPEC-ADDENDUM §QA Agent: Coverage-Aware Testing)
- [ ] Finalizer QA coverage gate — finalizer (loop.sh:2440-2451) exits unconditionally without checking QA_COVERAGE.md; spec requires abort if >30% UNTESTED or any FAIL features remain (SPEC-ADDENDUM §QA Coverage Enforcement at Loop Exit)

#### Dashboard (priority: medium)

- [ ] Dashboard component decomposition — AppView.tsx is 2378 lines with ~12 inline component functions (Sidebar, Header, HealthPanel, etc.); spec requires <200 LOC per file, each with test + story. UI primitives (14 files in src/components/ui/) are already extracted. (SPEC-ADDENDUM §Dashboard Component Architecture)
- [ ] Storybook 8 configuration — devDependencies installed and npm scripts defined, but no `.storybook/` config directory or `.stories.tsx` files exist; need `storybook init` equivalent setup with main.ts, preview.ts, theme decorator, and colocated stories (SPEC-ADDENDUM §Storybook Integration)

#### OpenCode / Cost (priority: medium)

- [ ] Cost-aware provider routing — budget tracking and CostDisplay widget exist, but `cost_aware_routing` and `model_cost_preferences` config not implemented; round-robin does not dynamically switch providers based on cost (SPEC-ADDENDUM §OpenCode First-Class Parity)

#### Orchestrator Refinement (priority: medium)

- [ ] UI variant exploration — decompose agent does not create 2-3 variant sub-issues for UI features; feature flag convention not generated; `aloop setup` does not estimate `ui_variant_exploration` (SPEC §Parallel Orchestrator Mode > UI Variant Exploration, SPEC-ADDENDUM §Known Gap #4)
- [ ] Scan agent self-healing diagnostics — ALERT.md is written on startup failures (orchestrate.ts:1771-1786) but no `diagnostics.json` for persistent blockers; stuck detection escalation missing; dashboard doesn't display blocker banners (SPEC-ADDENDUM §Scan Agent Self-Healing)

#### CLI (priority: low)

- [ ] CLI help simplification — default `aloop --help` shows all 14 commands (6 core + 8 extended in aloop.mjs); spec requires only 6 user-facing commands visible by default, with `--help --all` for full list (SPEC-ADDENDUM §CLI Simplification)
- [ ] Domain skill discovery (tessl integration) — P2 feature; no integration with tessl for discovering domain-specific agent skills during setup (SPEC §Domain Skill Discovery)

### Deferred

- [ ] Synthetic orchestrator test scenario — E2E test against `agent-forge` repo; requires all orchestrator features to be stable first (SPEC-ADDENDUM §Synthetic Orchestrator Test Scenario)
- [ ] `LocalAdapter` for file-based orchestration without GitHub — adapter interface exists but only `GitHubAdapter` implemented; local adapter deferred until demand (SPEC-ADDENDUM §Orchestrator Adapter Pattern)
- [ ] ZDR (Zero Data Retention) scaffold — `aloop setup` does not generate provider-specific ZDR config when `data_privacy: private` selected (SPEC §Zero Data Retention)
- [ ] Devcontainer integration — devcontainer.json generation, provider auth strategy, workspace mount handling not implemented (SPEC §Devcontainer)
- [ ] Webhook-based monitoring (instant event notification) — optional enhancement over polling; `gh webhook forward` integration (SPEC §Efficient GitHub Monitoring)

### Completed

- [x] TypeScript `readProviderHealth()` unit tests — all 4 required cases covered in `session.test.ts` (lines 60-109)
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
- [x] [review] Gate 4: dead `useIsTouchLikePointer` hook deleted (d34983a5)
- [x] Provider health integration tests (bash): state transitions, backoff escalation, concurrent writes, lock failure, cross-session reset — all 8 tests in `loop_provider_health_integration.tests.sh`
- [x] Provider health status display tests (TS): `status.test.ts` covers formatHealthLine for healthy/cooldown/degraded + renderStatus + CLI integration
- [x] `{{SUBAGENT_HINTS}}` template variable resolved — loop.sh `substitute_prompt_placeholders()` expanded to load subagent hint files
- [x] `--output json` error path fixed — `withErrorHandling` wrapper respects `--output` mode on error paths [reviewed: gates 1-9 pass]
- [x] `aloop status --watch` terminal monitoring — auto-refreshes every 2s with ANSI clear (QA verified iter 35)
- [x] Dashboard responsiveness — hamburger sidebar (md:hidden), 44x44px touch targets (min-h-[44px]), responsive Tailwind breakpoints, mobile overlay menu with test coverage
- [x] OpenCode agent definitions scaffolded by `aloop setup` — vision-reviewer, error-analyst, code-critic in `.opencode/agents/`
- [x] Sandbox policy enforcement — container/host sandbox field enforced in dispatch; `filterByHostCapabilities()` validates `requires` labels; `ALOOP_TASK_SANDBOX` env var passed to child loops
- [x] OpenRouter cost monitoring dashboard widget — CostDisplay component with budget cap visualization, color-coded thresholds (green/yellow/red), real-time cost tracking, budget warning/pause thresholds
