# Project TODO

## Current Phase: Orchestrator + Loop Engine Hardening

Priority: Orchestrator core pipeline → Loop engine gaps → Dashboard refactor → P2 features

### In Progress

### Up Next

#### Orchestrator Core (Critical)

- [x] `aloop start` must dispatch to orchestrate mode when config says `mode: orchestrate` — currently throws error at `start.ts:366`. Remove the error, add dispatch logic to forward to `orchestrateCommand` with translated flags. (SPEC-ADDENDUM: `aloop start` as Unified Entry Point)
- [x] `aloop orchestrate --resume <session-id>` — no `--resume` flag or resume logic exists. Must reconstruct state from GitHub issues, detect live/dead children via PID check, avoid re-creating issues. (SPEC-ADDENDUM: Orchestrator Session Resumability)
- [x] `--no-task-exit` flag missing from `loop.ps1` — implemented in `loop.sh` but `loop.ps1` has no parameter or handling for it. Add parameter parsing and skip `check_all_tasks_complete` when set. (SPEC-ADDENDUM: Loop Flag `--no-task-exit`)
- [ ] CLI help shows 15 commands — spec says default `--help` shows only 6 user-facing (setup, start, status, steer, stop, dashboard). Hide internal commands (resolve, discover, scaffold, orchestrate, active, update, devcontainer, devcontainer-verify, process-requests) from default help. Add `--help --all` to show everything. (SPEC-ADDENDUM: CLI Simplification)

#### Loop Engine Gaps (Critical)

- [ ] Pre-iteration base merge — neither `loop.sh` nor `loop.ps1` runs `git fetch origin <base_branch>` / `git merge` before each iteration. Worktree branches drift from upstream. Must detect conflicts and queue `PROMPT_merge.md`. (SPEC: Branch Sync & Auto-Merge, Priority P1)
- [ ] Provider health file locking missing from `loop.sh` — `loop.ps1` uses `FileShare.None` for exclusive writes, but `loop.sh` has no `flock` equivalent. Add `flock` with 5-attempt progressive backoff and graceful degradation. (SPEC: Global Provider Health > Concurrency / File Locking)
- [ ] `{{SUBAGENT_HINTS}}` template expansion missing — neither script resolves this variable. Per spec: if provider is opencode and `.opencode/agents/` exists, populate from `subagent-hints-{phase}.md`. Otherwise empty string. (SPEC: Configurable Agent Pipeline > Subagent Integration)

#### Dashboard Refactor (High — prerequisite for dashboard work)

- [ ] AppView.tsx decomposition — still 2,378 lines, must be split into ~150 LOC components per SPEC-ADDENDUM. Extract in order: utilities (ansi.ts, format.ts, types.ts) → leaf components → composite → layout → thin shell. Each component needs `.test.tsx` and `.stories.tsx`. (SPEC-ADDENDUM: Dashboard Component Architecture)
- [ ] Storybook setup — deps installed but no `.storybook/` config directory and zero `.stories.tsx` files. Create `.storybook/main.ts` and `preview.ts` with Tailwind/dark-mode decorator. Add stories for existing extracted components. (SPEC-ADDENDUM: Storybook Integration)

#### Prompt Templates (High)

- [ ] Create `PROMPT_loop_health.md` — supervisor agent that runs every N iterations, detects repetitive cycling, queue thrashing, stuck cascades, wasted iterations. Can trip circuit breakers. (SPEC: Configurable Agent Pipeline > Infinite Loop Prevention)
- [ ] Create `PROMPT_orch_skill_scout.md` — runs after decomposition, before dispatch. Searches tessl for domain skills per task. (SPEC: Domain Skill Discovery > Phase 2)
- [ ] Create `PROMPT_orch_triage.md` — classifies user comments on issues/PRs as actionable/needs_clarification/question/out_of_scope. (SPEC: User Feedback Triage Agent)
- [ ] Create `PROMPT_debug.md` — stuck detection agent queued by runtime when N consecutive failures detected. (SPEC: Configurable Agent Pipeline > Event-Driven Agent Dispatch)

#### Orchestrator Features (High)

- [ ] Scan agent diagnostics and self-healing — track blocker persistence across iterations, write `diagnostics.json` after N iterations with same blocker. Self-heal known issues (missing labels, config). Write `ALERT.md` for critical blockers. (SPEC-ADDENDUM: Scan Agent Self-Healing)
- [ ] Commit-aware PR review — store HEAD SHA when PR is reviewed, skip re-review if no new commits. Include previous PR comments in review prompt with "do not repeat" instruction. (SPEC-ADDENDUM: Orchestrator PR Review)
- [ ] Sub-spec written to `TASK_SPEC.md` not `SPEC.md` — child loops must not overwrite the project's SPEC.md. `TASK_SPEC.md` must be gitignored and excluded from PRs. (SPEC-ADDENDUM: Orchestrator PR Review > Sub-Spec Handling)
- [ ] User feedback triage in orchestrator monitor loop — poll issue/PR comments, classify, inject steering or block child loop. (SPEC: User Feedback Triage Agent)
- [ ] UI variant exploration — decompose agent creates 2-3 sibling sub-issues for UI features when `ui_variant_exploration: true`. Feature flag convention not implemented. (SPEC: UI Variant Exploration)

#### QA Agent Improvements (High)

- [ ] Coverage-aware QA testing — QA agent must create/update `QA_COVERAGE.md` with structured parseable format, use priority algorithm (UNTESTED > FAIL > incomplete > stale), never test PASS features while UNTESTED remain. (SPEC-ADDENDUM: QA Agent Coverage-Aware Testing)
- [ ] Review Gate 10: QA Trend — add to PROMPT_review.md: check QA coverage %, stale bugs, coverage trend. (SPEC-ADDENDUM: QA Agent > Gate 10)
- [ ] Coverage enforcement at loop exit — finalizer QA pass must check coverage before allowing exit: abort if UNTESTED > 30% or any FAIL features. (SPEC-ADDENDUM: QA Agent > Coverage Enforcement)

#### Dashboard Features (Medium — after refactor)

- [ ] Component test coverage — most components in AppView.tsx lack `.test.tsx` files. Only CostDisplay.test.tsx and App.test.tsx exist. (SPEC-ADDENDUM: Dashboard Component Architecture)
- [ ] Orchestrator test scenario — create `aloop/test-fixtures/agent-forge-subset.md` and `verify-orchestrator.sh` for E2E validation of decomposition, dispatch, CI gates, merge, and resumability. (SPEC-ADDENDUM: Synthetic Orchestrator Test Scenario)

#### P2 Features (Deferred)

- [ ] Spec-gap periodic scheduling — every 2nd cycle timing not wired up in loop scripts. Spec-gap runs only in finalizer currently. (SPEC: Spec-Gap Analysis Agent > When It Runs)
- [ ] Docs agent periodic scheduling — same as spec-gap, every 2nd cycle after QA. Not wired up. (SPEC: Documentation Sync Agent > When It Runs)
- [ ] `aloop status --watch` terminal monitoring — command exists with 2s auto-refresh but needs verification against spec requirements. (SPEC: UX > Terminal monitoring fallback)
- [ ] Domain skill discovery (tessl integration) — `tessl init --project-dependencies` not called during setup. Skill scout agent not implemented. (SPEC: Domain Skill Discovery, Priority P2)
- [ ] OpenCode first-class parity — `.opencode/agents/` not created by setup, subagent delegation hints not injected, cost-aware routing not implemented. (SPEC-ADDENDUM: OpenCode First-Class Parity)
- [ ] Dashboard responsiveness verification — responsive layout implemented but needs Lighthouse mobile accessibility score >= 90 verification. (SPEC-ADDENDUM: Dashboard Responsiveness)
- [ ] OpenRouter cost monitoring widgets — `opencode db` aggregate queries, cost-by-model breakdown, budget warning toasts. Basic cost display exists but advanced analytics missing. (SPEC-ADDENDUM: OpenRouter Cost Monitoring)
- [ ] Loop health supervisor agent — `PROMPT_loop_health.md` template needed (tracked above), plus runtime integration for circuit breaker. (SPEC: Infinite Loop Prevention)

### Completed

- [x] `aloop orchestrate` spawns background daemon and registers in active.json
- [x] `process-requests` handles all standard request types (create_issues, update_issue, close_issue, dispatch_child, merge_pr, post_comment, steer_child, query_issues, spec_backfill)
- [x] `OrchestratorAdapter` interface defined in adapter.ts
- [x] `GitHubAdapter` wraps all gh CLI calls
- [x] GitHub ETag-based polling for efficient monitoring (github-monitor.ts)
- [x] `--no-task-exit` flag in loop.sh
- [x] `--no-task-exit` passed by orchestrate.ts to loop.sh
- [x] Dashboard command exists (claude + copilot)
- [x] `aloop status --watch` exists
- [x] `aloop setup` supports orchestrator mode recommendation
- [x] Phase prerequisites (build needs TODO.md, review needs commits) — both scripts
- [x] CLAUDECODE env var sanitization — both scripts, entry + per-invocation
- [x] Queue folder processing — both scripts
- [x] Finalizer support (finalizerPosition, allTasksMarkedDone) — both scripts
- [x] cyclePosition tracking separate from iteration — both scripts
- [x] Request waiting (requests/ folder) — both scripts
- [x] Provider stderr capture — both scripts
- [x] Provider timeout with frontmatter override — both scripts
- [x] `{{ITERATION}}` and `{{ARTIFACTS_DIR}}` template expansion — both scripts
- [x] run_id in log entries — both scripts
- [x] PID lockfile handling — both scripts
- [x] Provider health file locking — loop.ps1 (FileShare.None)
- [x] Command palette (Ctrl+K) — dashboard
- [x] Before/after comparison widget — dashboard (3 modes)
- [x] Responsive layout — dashboard (mobile/tablet/desktop breakpoints)
- [x] Provider health tab in docs panel — dashboard
- [x] SSE real-time updates — dashboard
- [x] Proof artifact display in activity log — dashboard
- [x] Cost display widget — dashboard (CostDisplay component)
- [x] Session sidebar tree view — dashboard (project-grouped)
- [x] Elapsed timer for active iterations — dashboard
- [x] All orchestrator prompt templates (orch_scan, orch_decompose, orch_estimate, etc.)
- [x] Shared instructions via `{{include:path}}` — templates exist with include directives
- [x] Subagent hint files exist (subagent-hints-build.md, subagent-hints-proof.md, subagent-hints-review.md)
