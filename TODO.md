# Project TODO

## Current Phase: Spec-Compliance — Orchestrator Core + Setup (P0/P1)

Priority: Loop engine correctness -> Orchestrator core -> GitHub integration -> Dashboard polish -> Test coverage

### In Progress
- [x] [review] Gate 4: `dashboard.ts:568` — `sendToDefaultSessionClients` is dead code (defined but never called). Remove it. (priority: high)
- [ ] [review] Gate 4: `dashboard.ts:582-615` — `publishState` has identical logic in both `isGlobal` and `else` branches (copy-paste duplication). Consolidate into a single code path. (priority: high)
- [ ] [review] Gate 8: `@radix-ui/react-dropdown-menu@^2.1.16` was added to `dashboard/package.json` but is missing from `VERSIONS.md`. Add it to the Dashboard production dependencies table. (priority: high)
- [ ] [orchestrator/P0] [research] GitHub-native state model feasibility — verify whether issue state + Project status can replace `aloop/*` progression labels; target single tracking label `aloop` unless native states cannot represent required transitions. Current orchestrate.ts uses label-based state (`pending`/`in_progress`/`pr_open`/`merged`/`failed`); spec requires Project status field (`Needs analysis`/`Needs decomposition`/`Ready`/`In progress`/`Done`) with label fallback.
- [x] [orchestrator/P0] Definition of Ready (DoR) gate — `PROMPT_orch_estimate.md` template defines DoR criteria but orchestrate.ts does not invoke the estimate agent or enforce DoR validation before dispatch. Wire the template into the orchestrator flow.

### Up Next — P0 (Blocking)
- [~] [orchestrator/P0] Label-driven state machine — cancelled: superseded by steering to research GitHub-native status/project-state progression with minimal labels.
- [x] [orchestrator/P0] Global spec gap analysis — wire product analyst + architecture analyst agents to run before decomposition, creating `aloop/spec-question` issues for gaps. Templates loaded, written to prompts dir, and invoked via `createGapAnalysisRequests()` + `queueGapAnalysisForIssues()` for issues in `Needs analysis` status.
- [x] [orchestrator/P0] Orchestrator scan loop — orchestrate.ts initializes state and applies decomposition but has no main processing loop. Implement the scan-agent heartbeat cycle: read GitHub state each iteration, identify items ready for their next state transition, and queue work via `requests/*.json` and `queue/*.md`.

### Up Next — P1 (Core Features)
- [x] [orchestrator/P1] Epic & sub-issue decomposition logic — wired orchestrator bootstrap epic decomposition (`epic-decomposition.json` + `decompose-epics.md`), per-epic sub-decomposition requests/queue prompts (`sub-issue-decomposition.json` + `sub-decompose-issue-*.md`), decomposition result application (`epic-decomposition-results.json`, `sub-decomposition-results.json`), and file ownership hint propagation on orchestrator issues.
- [x] [orchestrator/P1] Missing orchestrator prompts — add remaining templates not present: `PROMPT_orch_resolver.md` (spec-question resolution per autonomy level), `PROMPT_orch_replan.md` (event-driven replanning), `PROMPT_orch_spec_consistency.md` (spec reorganization after changes). 11 of 14 spec-referenced templates exist.
- [x] [orchestrator/P1] Orchestrator dispatch logic — when sub-issues reach `Ready` status, create worktree, compile child `loop-plan.json` with implementation cycle, seed sub-spec, launch child `loop.sh`. Respect concurrency cap and wave scheduling. File ownership hints prevent parallel edit conflicts.
- [x] [orchestrator/P1] Monitor/gate/merge cycle — child status monitoring (read `status.json`), stuck-child steering, PR creation on completion, gate enforcement (CI, coverage, merge conflicts, spec regression), squash merge to `agent/trunk`, downstream unblocking.
- [ ] [orchestrator/P1] Autonomy levels (cautious/balanced/autonomous) — config in setup, resolver agent, risk classification, autonomous decision logging, user override.
- [ ] [orchestrator/P1] Replan on spec change — git diff watcher on spec glob, replan agent, spec backfill mechanism, spec consistency agent, provenance-based infinite loop prevention.
- [x] [gh/P1] GitHub Enterprise support — removed remaining hardcoded `github.com` URL generation in loop runtime output paths (`loop.sh`/`loop.ps1` remote backup links) by normalizing git remotes/created repo URLs to host-agnostic web links.
- [ ] [gh/P1] CI/GitHub Actions integration hardening — align orchestrator merge/gating flow to consistently prefer CI outcomes and enforce same-error persistence checks before re-iteration caps.
- [ ] [dashboard/P1] Proof artifact comparison modes — expandable lightbox, before/after comparison (side-by-side, slider, diff overlay), history scrubbing dropdown, diff percentage badge.
- [ ] [setup/P1] Data privacy setup question — ask internal vs public, affect model choice and ZDR flags, may exclude providers.

### Up Next — P2
- [ ] [orchestrator/P2] Multi-file spec support — `specs/*.md` globbing, merging logic, master spec + vertical-slice-group pattern.
- [ ] [orchestrator/P2] Efficient GitHub monitoring — ETag-guarded REST, GraphQL full state fetch, `since` parameter filtering, webhook push support, rate limit budget.
- [ ] [orchestrator/P2] Devcontainer routing — per-task `sandbox: container|none`, `requires: [windows, macos, gpu]`, dispatcher checks host environment.
- [ ] [gh/P2] Agent trunk auto-merge — auto-merge config in `config.yml`, human-only approval for `agent/trunk` -> `main`, default `agent/main` creation.
- [ ] [setup/P2] Dual-mode setup recommendation — analyze scope, recommend loop vs orchestrator, check CI workflow support.

### Deferred (Low Priority)
- [ ] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard/low] Repair broken E2E `smoke.spec.ts` flow once core P0 gates are green.
- [ ] [dashboard/low] Docs-tab trigger filtering — tab triggers still appear for docs with defined-but-empty-string content; spec requires non-empty doc tabs only (`App.tsx:706` filters `!== undefined` instead of truthy).

### Completed
- [x] [loop/P0] Retry same phase on failure — phase cycle advances only on successful iterations, with `MAX_PHASE_RETRIES` safety valve.
- [x] [loop/P0] Queue file deletion — queue override files are deleted on both success and failure paths after processing.
- [x] [security/P0] PATH sanitization — `gh` is blocked from agent invocations via shim/path hardening and cleaned up after execution.
- [x] [loop/P0] Provider stderr capture & failure classification — stderr captured separately and classified (`rate_limit`/`auth`/`timeout`/`concurrent_cap`/`unknown`) for health tracking.
- [x] [loop/P1] Exponential backoff for provider failures — hard-capped cooldown table implemented.
- [x] [loop/P1] File locking for provider health files — lock with retries + graceful degradation and log events implemented.
- [x] [loop/P1] Child process tracking & timeout — provider timeout with process-tree termination and exit cleanup implemented in loop scripts.
- [x] [gh/P1] PR feedback loop & CI failure handling — `aloop gh watch` monitors PR comments/check failures, injects steering, applies max feedback iterations, and tracks processed runs/comments.
- [x] [cli/P1] Agent commands — `/aloop:dashboard` command + `copilot/prompts/aloop-dashboard.prompt.md` exist and route to `aloop dashboard`.
- [x] [cli/P2] `aloop status --watch` — live-updating terminal view with 2s refresh loop and terminal re-render.
- [x] [runtime/medium] Investigate and fix loop shell arithmetic/log-path warnings observed during `loop_provenance.tests.sh` (`log.jsonl.raw` missing path and `0\n0` arithmetic parse errors).
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
- [x] [orchestrator] Orchestrator prompt templates (14 files).
- [x] [orchestrator/P0] Definition of Ready (DoR) gate — `validateDoR()` enforces DoR criteria before dispatch in `getDispatchableIssues()`.
- [x] [orchestrator/P1] Missing orchestrator prompts — added `PROMPT_orch_resolver.md`, `PROMPT_orch_replan.md`, `PROMPT_orch_spec_consistency.md`.
