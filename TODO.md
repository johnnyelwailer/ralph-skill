# Project TODO

## Current Phase: Spec-Compliance — P1 Core Completion (Loop/Orchestrator first)

Priority: (1) loop/orchestrator core parity, (2) setup+GH hardening, (3) dashboard UX/test polish, (4) P2 enhancements.

### In Progress
- [x] [review] Gate 1: Spec Compliance — GitHub Project status interaction is missing. Implement `gh project item-edit` calls for issue progression. (priority: high)
- [x] [review] Gate 4: Dead Logic — `runSpecChangeReplan` queues prompts in `queue/` but nothing in the CLI processes them. Implement a prompt processor or trigger the agent. (priority: high)
- [ ] [review] Gate 4: Copy-paste Duplication — Consolidate `spec_backfill` logic between `requests.ts` and `orchestrate.ts`, ensuring provenance trailers are always included. (priority: high)
- [ ] [review] Gate 6: Proof missing for Spec Change Replan. Provide a CLI recording or log showing detection and replan triggering. (priority: high)
- [ ] [review] Gate 8: VERSIONS.md Drift — Add `git` to the Runtime section of `VERSIONS.md`. (priority: high)

### Up Next — P0/P1 (Blocking Core)
- [ ] [gh/P1] CI/GitHub Actions integration hardening — enforce CI-first gating consistently and add same-error persistence checks before re-iteration caps.
- [ ] [setup/P1] Data privacy setup question — ask internal/private vs public/open-source and apply provider/model/ZDR constraints from answer.

### Up Next — P1 (After Core)
- [ ] [dashboard/P1] Proof artifact comparison modes — add before/after comparison UX (side-by-side, slider, diff overlay) and history scrubbing. (Diff badge already implemented.)

### Up Next — P2
- [ ] [orchestrator/P2] Multi-file spec support — `specs/*.md` globbing, merge logic, master-spec + vertical-slice-group pattern.
- [ ] [orchestrator/P2] Efficient GitHub monitoring — ETag-guarded REST change detection, targeted GraphQL full-state fetch, `since` filtering, optional webhook push.
- [ ] [orchestrator/P2] Devcontainer routing — per-task `sandbox: container|none`, `requires: [windows, macos, gpu]`, dispatcher host-capability checks.
- [ ] [gh/P2] Agent trunk auto-merge — auto-merge policy in config, human-only approval for `agent/trunk` -> `main`, default `agent/main` creation.
- [ ] [setup/P2] Dual-mode setup recommendation — analyze scope and recommend loop vs orchestrator mode, including CI workflow support checks.

### Deferred (Low Priority)
- [ ] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard/low] Repair broken E2E `smoke.spec.ts` flow once core P0/P1 gates are green.
- [~] [dashboard/low] Docs-tab trigger filtering task cancelled — already implemented (`App.tsx` now filters non-empty docs via `docs[n] != null && docs[n] !== ''`).

### Cancelled / Superseded
- [~] [orchestrator/P0] Label-driven state machine — superseded by GitHub-native status/project-state progression with minimal-label fallback.

### Completed
- [x] [orchestrator/P1] Autonomy levels (cautious/balanced/autonomous) — wire setup/config to resolver behavior, risk classification, autonomous decision logging, and user override.
- [x] [orchestrator/P0] [research] GitHub-native state model feasibility — finalized: use Project status + issue state for progression; keep only minimal labels (`aloop`, `aloop/spec-question`, `aloop/blocked-on-human`, `aloop/auto-resolved`, `aloop/wave-*`).
- [x] [orchestrator/P1] Replan on spec change — add spec diff watcher (`SPEC.md` + `specs/*.md`), trigger replan agent, apply spec backfill flow, and add loop-prevention provenance.
- [x] [review] Gate 4: `dashboard.ts:568` — `sendToDefaultSessionClients` dead code removed.
- [x] [review] Gate 4: `dashboard.ts:582-615` — duplicate `publishState` branch logic consolidated.
- [x] [review] Gate 8: added missing `@radix-ui/react-dropdown-menu@^2.1.16` entry to `VERSIONS.md`.
- [x] [orchestrator/P0] Definition of Ready (DoR) gate wired and enforced before dispatch (`validateDoR()` in dispatch eligibility).
- [x] [orchestrator/P0] Global spec gap analysis wired (product + architecture analysts, request/queue plumbing).
- [x] [orchestrator/P0] Orchestrator scan loop implemented (state read, transition detection, queue/request work dispatch).
- [x] [orchestrator/P1] Epic + sub-issue decomposition logic implemented.
- [x] [orchestrator/P1] Missing orchestrator prompts added (`PROMPT_orch_resolver.md`, `PROMPT_orch_replan.md`, `PROMPT_orch_spec_consistency.md`).
- [x] [orchestrator/P1] Orchestrator dispatch logic implemented (worktree/loop-plan/sub-spec launch with concurrency + ownership checks).
- [x] [orchestrator/P1] Monitor/gate/merge cycle implemented (child status, PR create, gate checks, squash merge, downstream unblocking).
- [x] [gh/P1] GitHub Enterprise support hardened for host-agnostic URL generation in loop runtime outputs.
- [x] [loop/P0] Retry same phase on failure with `MAX_PHASE_RETRIES` safety valve.
- [x] [loop/P0] Queue file deletion on both success and failure paths.
- [x] [security/P0] PATH sanitization blocks `gh` from agent invocations.
- [x] [loop/P0] Provider stderr capture + failure classification implemented.
- [x] [loop/P1] Exponential backoff for provider failures implemented with hard caps.
- [x] [loop/P1] File locking for provider health implemented.
- [x] [loop/P1] Child process tracking + timeout handling implemented.
- [x] [gh/P1] PR feedback loop + CI failure handling (`aloop gh watch`) implemented.
- [x] [cli/P1] Agent dashboard command routing implemented (`/aloop:dashboard` + Copilot prompt).
- [x] [cli/P2] `aloop status --watch` live-updating terminal view implemented.
- [x] [runtime/medium] Loop shell arithmetic/log-path warning fixes completed.
- [x] [runtime] Provenance commit trailers implemented in `loop.sh` and `loop.ps1`.
- [x] [review] Gate 6 artifact drift for iter-11 resolved.
- [x] [dashboard] Provider health retained as docs-panel tab.
- [x] [dashboard] `M/A/D/R` file-type indicators in expanded commit rows.
- [x] [dashboard] Per-iteration duration display in activity rows.
- [x] [review] Gate 3 branch coverage thresholds met for `plan.ts`, `yaml.ts`, `compile-loop-plan.ts`, `requests.ts`, and `gh.ts`.
- [x] [review] `VERSIONS.md` created for Gate 8 compliance.
- [x] [dashboard] Docs-tab non-empty filtering.
- [x] [pipeline] Configurable agent pipeline (`pipeline.yml`, `.aloop/agents/`).
- [x] [orchestrator] Orchestrator prompt templates (14 files).
