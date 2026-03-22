# Project TODO

## Current Phase: Orchestrator Pipeline E2E — Gap Closure

### In Progress

(none)


### Up Next

#### Loop Engine (priority: high)

- [x] Spec-gap periodic scheduling (every 2nd cycle) — runtime monitors cycleCount and queues spec-gap + docs prompts on even cycles; loop.sh/loop.ps1 track cycleCount in loop-plan.json
- [ ] Loop health supervisor agent missing — no `PROMPT_loop_health.md` template; no circuit breaker or pattern detection for repetitive cycling/stuck cascades (SPEC §Configurable Agent Pipeline > Loop health supervisor)
- [ ] `{{SUBAGENT_HINTS}}` template variable not resolved — loop.sh/loop.ps1 do not expand this variable; per-phase hint files don't exist; opencode subagent delegation instructions not injected (SPEC §Configurable Agent Pipeline > Subagent Integration)

#### QA & Coverage (priority: high)

- [ ] QA coverage tracking enforcement — QA agent does not reliably produce structured `QA_COVERAGE.md` with parseable pipe-delimited format; priority selection algorithm (UNTESTED > FAIL > incomplete > stale) not in prompt; review Gate 10 missing (SPEC-ADDENDUM §QA Agent: Coverage-Aware Testing)
- [ ] Finalizer QA coverage gate — finalizer does not check QA_COVERAGE.md before allowing loop exit; spec requires abort if >30% UNTESTED or any FAIL features remain (SPEC-ADDENDUM §QA Coverage Enforcement at Loop Exit)

#### Dashboard (priority: medium)

- [ ] Dashboard component decomposition — AppView.tsx is 2378 lines; sub-components exist inline but not extracted to separate files; spec requires <200 LOC per file, each with test + story (SPEC-ADDENDUM §Dashboard Component Architecture)
- [ ] Storybook 8 not configured — no `.storybook/` directory exists; spec requires `@storybook/react-vite` setup with colocated stories and theme decorator (SPEC-ADDENDUM §Storybook Integration)
- [ ] Dashboard responsiveness — minimal mobile support; spec requires hamburger sidebar below 640px, fixed steer input on mobile, 44x44px tap targets, 320px viewport support (SPEC-ADDENDUM §Dashboard Responsiveness)
- [ ] `aloop status --watch` terminal monitoring — status command has no `--watch` mode for auto-refreshing terminal display (SPEC §UX: Dashboard > acceptance criteria)

#### OpenCode / Cost (priority: medium)

- [ ] OpenRouter cost monitoring dashboard widgets — cost summary widget, per-session cost aggregation, cost-by-model breakdown, and budget warning toasts not implemented (SPEC-ADDENDUM §OpenRouter Cost Monitoring)
- [ ] OpenCode agent definitions not scaffolded by `aloop setup` — `.opencode/agents/` directory with vision-reviewer, error-analyst, code-critic agents not created during setup (SPEC-ADDENDUM §OpenCode First-Class Parity)
- [ ] Cost-aware provider routing — `cost_aware_routing` and `model_cost_preferences` config not implemented; round-robin does not consider cost (SPEC-ADDENDUM §OpenCode First-Class Parity)

#### Orchestrator Refinement (priority: medium)

- [ ] UI variant exploration — decompose agent does not create 2-3 variant sub-issues for UI features; feature flag convention not generated (SPEC §Parallel Orchestrator Mode > UI Variant Exploration)
- [ ] Scan agent self-healing diagnostics — no `diagnostics.json` written for persistent blockers; no `ALERT.md`; stuck detection escalation missing (SPEC-ADDENDUM §Scan Agent Self-Healing)
- [ ] Sandbox policy enforcement — `sandbox` field is stored in metadata but no actual container vs host enforcement logic (SPEC §Per-Task Environment Requirements)

#### CLI (priority: low)

- [ ] CLI help simplification — default `aloop --help` shows all 15 commands; spec requires only 6 user-facing commands visible by default (SPEC-ADDENDUM §CLI Simplification)
- [ ] Domain skill discovery (tessl integration) — P2 feature; no integration with tessl for domain-specific agent skills (SPEC §Domain Skill Discovery)

### Deferred

- [ ] Synthetic orchestrator test scenario — E2E test against `agent-forge` repo (SPEC-ADDENDUM §Synthetic Orchestrator Test Scenario)
- [ ] `LocalAdapter` for file-based orchestration without GitHub (SPEC-ADDENDUM §Orchestrator Adapter Pattern)
- [ ] ZDR (Zero Data Retention) scaffold (SPEC §Zero Data Retention)
- [ ] Devcontainer integration (SPEC §Devcontainer)
- [ ] Webhook-based monitoring (SPEC §Efficient GitHub Monitoring)

### Completed

- [x] OrchestratorAdapter interface defined in `src/lib/adapter.ts` with GitHubAdapter implementation and test suite
- [x] All 15 orchestrator prompt templates exist (`PROMPT_orch_*.md`)
- [x] `PROMPT_merge.md` template exists in `aloop/templates/`
- [x] Orchestrator spawns background daemon and registers in `active.json`
- [x] `aloop gh` subcommands implemented
- [x] process-requests command handles decomposition results, sub-decomposition, estimates, and agent convention requests
- [x] Provider health file locking in loop.sh (mkdir-based with retry backoff)
- [x] Phase prerequisites in loop.sh (build requires TODO.md tasks, review requires commits)
- [x] Retry-same-phase in loop.sh (cyclePosition stays on failure, retries with next provider)
- [x] Finalizer mode in loop.sh (finalizerPosition tracking, TODO re-check after each agent, abort on new TODOs)
- [x] `--no-task-exit` flag in loop.sh
- [x] CLAUDECODE env var sanitization
- [x] process-requests integration in loop.sh
- [x] Comment triage in orchestrate.ts
- [x] Spec change detection and replan in orchestrate.ts
- [x] PR lifecycle gating
- [x] Child loop monitoring
- [x] Orchestrator resumability
- [x] Dispatch with concurrency cap, wave scheduling, file ownership, host capability filtering
- [x] Branch sync before each iteration in loop.sh and loop.ps1
- [x] Integrate `OrchestratorAdapter` into `orchestrate.ts`
- [x] Storybook 8 devDependencies installed and npm scripts added
- [x] useIsTouchDevice and useIsTouchLikePointer hooks with tests
- [x] Self-healing: auto-create missing labels and derive missing config
- [x] `aloop start` forwards `mode: orchestrate` to orchestrator
