# Project TODO

## Current Phase: Core Loop Parity + Runtime Event Dispatch + P1 Hardening

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) P1 hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress
- [x] [loop/P1] **CRITICAL:** `loop.ps1` still uses legacy `plan-build-review` behavior in multiple paths (`Resolve-IterationMode`, cycle advance modulo, required prompt set, resume phase mapping, startup mode-cycle text), effectively modeling `plan -> build x3 -> proof -> review` instead of `plan -> build x5 -> qa -> review`. Bring full parity with `loop.sh` and validate via `loop.tests.ps1` coverage for normal run + resume scenarios. (priority: critical)

### Up Next — Review Fixes (Blocking)
- [x] [review] Gate 2: `aloop/cli/src/commands/project.test.ts:302-305` still verifies bootstrap by `existsSync(...)` presence checks only. Strengthen to assert copied template content matches bundled `aloop/templates/` sources, and add explicit negative-path assertion that bootstrap is skipped when `templatesDir` is provided. (priority: high)
- [x] [review] Gate 3: branch coverage proof for touched files is still incomplete/non-compliant for this iteration (`aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/devcontainer.ts`, `aloop/cli/lib/project.mjs`). Add executable coverage evidence and targeted tests for fallback/error branches (`selectUsableGhBinary` null/no-fallback + `failGhWatch` JSON path, deps-normalization fallback paths, bootstrap guard branches), meeting >=80% per touched file (>=90% for any new module). (priority: high)

### Up Next — Core Loop/Runtime Gaps (Spec-Priority)
- [x] [loop/P1] `loop.sh` still has stale `plan-build-review` resume mapping (`proof`/`review` indices for old 6-step cycle) that conflicts with current 8-step `qa` cycle and can mis-resume phase position. Align resume mapping and related mode metadata output with the compiled cycle semantics. (priority: high)
- [ ] [runtime/P1] Implement completion rattail chain from SPEC Proof-of-Work section (`all_tasks_done -> spec-review -> final-review -> final-qa -> proof -> completed`) and remove hardcoded monitor shortcuts that directly queue only `proof`/`review`. (priority: high)
- [ ] [runtime/P1] Add missing rattail prompt templates and wiring (`PROMPT_spec-review.md`, `PROMPT_final-review.md`, `PROMPT_final-qa.md`) so runtime event chaining has concrete catalog entries. (priority: high)
- [ ] [loop/P2] Add `trigger` frontmatter support to agent prompt templates so agents declare event bindings (example: `trigger: all_tasks_done`). (priority: medium)
- [ ] [runtime/P2] Implement generic event -> catalog scan -> queue dispatch in runtime monitor (`aloop/templates/` + trigger matching), instead of phase-name-specific branching. (priority: medium)

### Up Next — P1 Hardening (After Core)
- [ ] [gh/P1] CI/GitHub Actions integration hardening — enforce CI-first gating in orchestrator/gh loops and add same-error persistence detection before auto re-iteration (stop retrying unchanged CI failures; surface actionable summary). (priority: high)
- [ ] [setup/P1] Data privacy setup flow — ask internal/private vs public/open-source during setup and apply provider/model policy constraints (including ZDR-safe defaults) to generated config. (priority: high)
- [ ] [devcontainer/P1] Devcontainer spec-conformance pass — verify `devcontainer`/`devcontainer-verify` behavior against SPEC Devcontainer acceptance criteria (lifecycle hooks, mounts, provider auth forwarding, verification loop) and close concrete gaps. (priority: high)
- [ ] [qa/P1] `aloop start` auto-monitoring parity — verify dashboard/terminal auto-open and fallback behavior across OS paths; ensure failures degrade with clear manual commands. (priority: medium)

### Up Next — P2
- [ ] [qa/P2] CLI error handling leaks stack traces — `aloop setup --autonomy-level invalid`, `aloop start` (no config), `aloop orchestrate --autonomy-level foo`, `aloop resolve --project-root /nonexistent` should return clean user-facing errors. (priority: medium)
- [ ] [qa/P2] `aloop setup` accepts invalid inputs without validation — nonexistent spec files and unknown provider names are written silently. (priority: medium)
- [ ] [qa/P2] `aloop scaffold --spec-files NONEXISTENT.md` writes nonexistent path to config without warning. (priority: medium)
- [ ] [orchestrator/P2] Multi-file spec support — `specs/*.md` globbing, merge logic, master-spec + vertical-slice-group pattern. (priority: medium)
- [ ] [orchestrator/P2] Efficient GitHub monitoring — ETag-guarded REST change detection, targeted GraphQL full-state fetch, `since` filtering, optional webhook push. (priority: medium)
- [ ] [orchestrator/P2] Devcontainer routing — per-task `sandbox: container|none`, `requires: [windows, macos, gpu]`, dispatcher host-capability checks. (priority: medium)
- [ ] [gh/P2] Agent trunk auto-merge — auto-merge policy in config, human-only approval for `agent/trunk -> main`, default `agent/main` creation. (priority: medium)
- [ ] [setup/P2] Dual-mode setup recommendation — analyze scope and recommend loop vs orchestrator mode, including CI workflow support checks. (priority: medium)

### Deferred (Low Priority / After Core)
- [ ] [qa/P1] Dashboard docs tabs empty in some sessions (`/api/state` docs payload unresolved/empty due context/workdir mismatch reports) — keep deferred until current loop/runtime parity blockers are closed. (priority: low)
- [ ] [qa/P1] Dashboard desktop layout mismatch at 1920x1080 (sidebar/docs/activity visibility) — defer until loop/orchestrator core priorities are complete. (priority: low)
- [ ] [qa/P1] Dashboard health tab missing `codex` when no recent codex event exists — likely requires configured-provider-based health baseline, not log-only derivation. (priority: low)
- [ ] [dashboard/P1] Proof artifact comparison modes — side-by-side/slider/diff overlay + history scrubbing. (priority: low)
- [ ] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard/low] Extend E2E `smoke.spec.ts` coverage for explicit 1920x1080 sidebar/docs/activity visibility checks once core gates are green.

### Cancelled / Superseded
- [~] [orchestrator/P0] Label-driven state machine — superseded by GitHub-native status/project-state progression with minimal-label fallback.
- [~] [dashboard/low] Docs-tab trigger filtering — already implemented (`App.tsx` filters non-empty docs).
- [~] [qa/P1] Provider health backoff — superseded: cooldown behavior in `loop.sh` is correct; remaining cross-platform defect is tracked separately as loop parity tasks.
- [~] [qa/P1] `aloop steer` CLI command missing from `aloop.mjs` help and core list — superseded by broader `aloop.mjs --help` interception fix.

### Completed
- [x] [orchestrator/P1] Autonomy levels (cautious/balanced/autonomous) — wire setup/config to resolver behavior, risk classification, autonomous decision logging, and user override.
- [x] [orchestrator/P0] [research] GitHub-native state model feasibility — finalized: use Project status + issue state for progression; keep only minimal labels.
- [x] [orchestrator/P1] Replan on spec change — spec diff watcher, replan agent trigger, spec backfill flow, loop-prevention provenance.
- [x] [review] Gate 4: Dead import — `App.tsx:7` unused `X` import removed.
- [x] [review] Gate 4: Queue file leak — `processQueuedPrompts` now unlinks consumed queue files.
- [x] [review] Gate 4: Committed test artifact — `aloop/cli/dashboard/test-results/` removed and `.gitignore`d.
- [x] [review] Gate 9: README gate table updated from “8 gates” to “9 gates” with Gate 9 row.
- [x] [review] Gate 4: `dashboard.ts:568` — `sendToDefaultSessionClients` dead code removed.
- [x] [review] Gate 4: `dashboard.ts:582-615` — duplicate `publishState` branch logic consolidated.
- [x] [review] Gate 8: added missing `@radix-ui/react-dropdown-menu@^2.1.16` entry to `VERSIONS.md`.
- [x] [orchestrator/P0] Definition of Ready (DoR) gate wired and enforced before dispatch.
- [x] [orchestrator/P0] Global spec gap analysis wired (product + architecture analysts, request/queue plumbing).
- [x] [orchestrator/P0] Orchestrator scan loop implemented.
- [x] [orchestrator/P1] Epic + sub-issue decomposition logic implemented.
- [x] [orchestrator/P1] Missing orchestrator prompts added.
- [x] [orchestrator/P1] Orchestrator dispatch logic implemented.
- [x] [orchestrator/P1] Monitor/gate/merge cycle implemented.
- [x] [gh/P1] GitHub Enterprise support hardened.
- [x] [loop/P0] Retry same phase on failure with `MAX_PHASE_RETRIES` safety valve.
- [x] [loop/P0] Queue file deletion on both success and failure paths.
- [x] [security/P0] PATH sanitization blocks `gh` from agent invocations.
- [x] [loop/P0] Provider stderr capture + failure classification implemented.
- [x] [loop/P1] Exponential backoff for provider failures implemented with hard caps.
- [x] [loop/P1] File locking for provider health implemented.
- [x] [loop/P1] Child process tracking + timeout handling implemented.
- [x] [gh/P1] PR feedback loop + CI failure handling (`aloop gh watch`) implemented.
- [x] [cli/P1] Agent dashboard command routing implemented.
- [x] [cli/P2] `aloop status --watch` live-updating terminal view implemented.
- [x] [runtime/medium] Loop shell arithmetic/log-path warning fixes completed.
- [x] [runtime] Provenance commit trailers implemented.
- [x] [review] Gate 6 artifact drift for iter-11 resolved.
- [x] [dashboard] Provider health retained as docs-panel tab.
- [x] [dashboard] `M/A/D/R` file-type indicators in expanded commit rows.
- [x] [dashboard] Per-iteration duration display in activity rows.
- [x] [review] Gate 3 branch coverage thresholds met.
- [x] [review] `VERSIONS.md` created for Gate 8 compliance.
- [x] [dashboard] Docs-tab non-empty filtering.
- [x] [pipeline] Configurable agent pipeline (`pipeline.yml`, `.aloop/agents/`).
- [x] [orchestrator] Orchestrator prompt templates (14 files).
- [x] [review] Gate 1: GitHub Project status interaction implemented.
- [x] [review] Gate 4: `runSpecChangeReplan` queue processing implemented.
- [x] [review] Gate 4: `spec_backfill` duplication consolidated.
- [x] [review] Gate 6: Proof for Spec Change Replan verified.
- [x] [fix] `orchestrateCommand` dependency injection fixed.
- [x] [review] Gate 8: VERSIONS.md — added `git` to Runtime section.
- [x] [qa/P1] `aloop steer` CLI command — implemented in `steer.ts`.
- [x] [review] Gate 4: Dead code in loop scripts — restored universal iteration summary logging and removed orphaned backup push helpers.
- [x] [review] Gate 1: `{{include:path}}` support implemented in scaffold template expansion with nested include + safety checks.
- [x] [review] Gate 1: Fallback cycle updated to include `qa` for `plan-build-review` in compile-loop-plan.
- [x] [review] Gate 3: `monitor.ts` branch coverage raised above gate target.
- [x] [review] Gate 3: `update.ts` branch coverage raised above gate target.
- [x] [review] Gate 4: Steering prompt prepend logic deduplicated into shared helper.
- [x] [review] Gate 1: monitor steering queue now prepends user steering instruction to template content.
- [x] [review] Gate 1: `aloop steer` command surfaced in `aloop.mjs` help.
- [x] [review] Gate 3: `monitor.ts` failure-path test coverage expanded.
- [x] [review] Gate 3: `steer.ts` branch coverage gaps (ambiguity/text-mode paths) closed.
- [x] [review] Gate 4: Process integrity task-text preservation documented and restored.
- [x] [review] Gate 1: steering template + instruction merge fixed across steer/dashboard/orchestrate.
- [x] [review] Gate 6: proof-manifest filler artifact policy tightened and filler outputs removed.
- [x] [review] Gate 9: README drift fixed ("9 gates").
- [x] [qa/P1] `aloop.mjs` help interception fixed and extended command help parity restored.
- [x] [qa/P1] `aloop update` executable permissions fixed for Unix scripts/shims.
- [x] [qa/P1] `aloop start` dashboard spawn now uses absolute binary paths.
- [x] [qa/P1] `aloop start` active-session cleanup on spawn failure implemented.
- [x] [qa/P1] `aloop orchestrate --spec NONEXISTENT.md` now fails fast with spec-path validation.
- [x] [qa/P1] `aloop setup --non-interactive` fresh-HOME bootstrap fixed.
- [x] [qa/P1] `aloop gh watch` raw stack-trace crash path hardened with clean user-facing failure handling + gh binary fallback selection.
- [x] [qa/P1] `aloop devcontainer` commander action-arg mismatch fixed via deps normalization guard.
- [x] [qa/P1] `aloop scaffold` now includes `PROMPT_qa.md` in validation/copy loops.
- [x] [qa/P1] Provider health backoff report closed as false positive after verification.
