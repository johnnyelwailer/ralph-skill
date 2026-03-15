# Project TODO

## Current Phase: Spec-Compliance — Loop Engine + Orchestrator (P0/P1)

Priority: Loop engine correctness → Orchestrator core → GitHub integration → Dashboard polish → Test coverage

### In Progress
- [ ] [loop/P0] Retry same phase on failure — phase cycle should only advance on success, not error. Failed iterations retry same phase with next round-robin provider. Add `MAX_PHASE_RETRIES` safety valve.
- [ ] [loop/P0] Queue file deletion — queue files must be deleted after agent completes, otherwise steering breaks on next iteration.

### Up Next — P0 (Blocking)
- [ ] [security/P0] PATH sanitization — strip `gh` binary from agent PATH before provider invocation (defense-in-depth per spec Security Model).
- [ ] [loop/P0] Provider stderr capture & failure classification — separate stderr from stdout, classify failures as rate_limit/auth/timeout/unknown for accurate health tracking.
- [ ] [orchestrator/P0] Label-driven state machine — state transitions triggered by GitHub label changes (`aloop/needs-analysis`, `aloop/ready`, `aloop/in-progress`, etc.) not wired.
- [ ] [orchestrator/P0] Definition of Ready (DoR) gate — validate acceptance criteria clarity, dependencies resolved, approach defined, estimated, interface contracts before dispatching to build.
- [ ] [orchestrator/P0] Global spec gap analysis — wire product analyst + architecture analyst agents to run before decomposition, creating `aloop/spec-question` issues for gaps.

### Up Next — P1 (Core Features)
- [ ] [orchestrator/P1] Epic & sub-issue decomposition logic — vertical slice decomposition, sub-issue creation/linking via GitHub API, file ownership hints for parallel edit conflict prevention.
- [ ] [orchestrator/P1] Orchestrator agent prompts — create all missing prompt templates: `PROMPT_orch_decompose.md`, `PROMPT_orch_epic_refine.md`, `PROMPT_orch_sub_decompose.md`, `PROMPT_orch_specialist_*.md`, `PROMPT_orch_estimate.md`, `PROMPT_orch_resolver.md`, `PROMPT_orch_product_analyst.md`, `PROMPT_orch_arch_analyst.md`, `PROMPT_orch_replan.md`, `PROMPT_orch_spec_consistency.md`.
- [ ] [orchestrator/P1] Autonomy levels (cautious/balanced/autonomous) — config in setup, resolver agent, risk classification, autonomous decision logging, user override.
- [ ] [orchestrator/P1] Replan on spec change — git diff watcher on spec glob, replan agent, spec backfill mechanism, spec consistency agent, provenance-based infinite loop prevention.
- [ ] [gh/P1] PR feedback loop & CI failure handling — `aloop gh watch` daemon monitoring PR comments/CI failures, `gh run view --log-failed` extraction, feedback as steering, max feedback iterations (default 5), dedup CI run IDs.
- [ ] [loop/P1] Exponential backoff for provider failures — hard-capped backoff table (1=none, 2=2min, 3=5min, ... 6+=60min), consecutive failure counter reset.
- [ ] [loop/P1] File locking for provider health files — exclusive write lock, shared read lock, progressive backoff retry (5 attempts), graceful degradation on lock failure.
- [ ] [loop/P1] Child process tracking & timeout — track child PIDs, enforce `ALOOP_PROVIDER_TIMEOUT` (default 10min), kill process tree on timeout, cleanup on loop exit.
- [ ] [gh/P1] GitHub Enterprise support — no hardcoded `github.com`, derive hostname from `git remote origin`, abstract in all `gh` operations + dashboard links.
- [ ] [gh/P1] CI/GitHub Actions integration — prefer CI over local validation, CI failure feedback extraction, steering injection with failure context, max re-iterations per CI failure (default 3), same-error persistence check.
- [ ] [dashboard/P1] Proof artifact comparison modes — expandable lightbox, before/after comparison (side-by-side, slider, diff overlay), history scrubbing dropdown, diff percentage badge.
- [ ] [cli/P1] Agent commands — create `/aloop:dashboard` command file and `aloop-dashboard.prompt.md` for Copilot.
- [ ] [setup/P1] Data privacy setup question — ask internal vs public, affect model choice and ZDR flags, may exclude providers.
- [ ] [runtime/medium] Investigate and fix loop shell arithmetic/log-path warnings observed during `loop_provenance.tests.sh` (`log.jsonl.raw` missing path and `0\n0` arithmetic parse errors).

### Up Next — P2
- [ ] [orchestrator/P2] Multi-file spec support — `specs/*.md` globbing, merging logic, master spec + vertical-slice-group pattern.
- [ ] [orchestrator/P2] Efficient GitHub monitoring — ETag-guarded REST, GraphQL full state fetch, `since` parameter filtering, webhook push support, rate limit budget.
- [ ] [orchestrator/P2] Devcontainer routing — per-task `sandbox: container|none`, `requires: [windows, macos, gpu]`, dispatcher checks host environment.
- [ ] [gh/P2] Agent trunk auto-merge — auto-merge config in `config.yml`, human-only approval for `agent/trunk` → `main`, default `agent/main` creation.
- [ ] [cli/P2] `aloop status --watch` — live-updating terminal view, fallback for headless environments.
- [ ] [setup/P2] Dual-mode setup recommendation — analyze scope, recommend loop vs orchestrator, check CI workflow support.

### Deferred (Low Priority)
- [ ] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard/low] Repair broken E2E `smoke.spec.ts` flow once core P0 gates are green.

### Completed
- [x] [runtime] Implement provenance commit trailers in `loop.sh` and `loop.ps1` (`Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session`).
- [x] [review] Gate 6 artifact drift for iter-11 resolved (artifacts verified present).
- [x] [dashboard] Keep provider health as docs-panel tab (spec-aligned).
- [x] [dashboard] `M/A/D/R` file-type indicators in expanded commit rows.
- [x] [dashboard] Per-iteration duration display in activity rows.
- [x] [review] Gate 3: `plan.ts` branch coverage >=80% (96.29%).
- [x] [review] Gate 3: `yaml.ts` branch coverage >=90% (96.29%).
- [x] [review] Gate 3: `compile-loop-plan.ts` branch coverage >=80% (90.58%).
- [x] [review] Gate 3: `requests.ts` branch coverage >=80% (84.09%).
- [x] [review] Gate 3: `gh.ts` branch coverage >=80% (81.59%).
- [x] [review] `VERSIONS.md` created for Gate 8 compliance.
- [x] [dashboard] Docs-tab non-empty filtering.
- [x] [pipeline] Configurable agent pipeline (`pipeline.yml`, `.aloop/agents/`).
- [x] [orchestrator] Orchestrator prompt templates (11 files).

## Blocked
