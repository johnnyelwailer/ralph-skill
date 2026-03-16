# Project TODO

## Current Phase: Core Loop Parity + Runtime Event Dispatch + P1 Hardening

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) P1 hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress
- [ ] [review] Gate 2: `monitor.test.ts:280` — assertion `!files.some(f => f.includes('PROMPT_plan') && f.includes('rattail'))` is a no-op because queue filenames never contain 'rattail'; would pass even if PROMPT_plan was incorrectly queued. Replace with `!files.some(f => f.includes('PROMPT_plan'))` to verify no plan is queued during normal build cycle. (priority: high)

- [x] [review] Gate 4: dead code remains in touched loop runtimes — `Update-ProofBaselines` (`aloop/bin/loop.ps1:798`) and `update_proof_baselines` (`aloop/bin/loop.sh:1321`) are defined but have no call sites. Remove unused functions or wire them into an active flow with tests proving invocation. (priority: medium)
  - Note: removing this dead code also resolves the remaining Gate 3 proof-branch coverage gaps (`proof.force_on_all_tasks_done`, `review.inject_proof_manifest`, `review.update_baselines_on_approval`) since those branches exist only in the dead functions. Cycle/resume branch coverage is already 100% per `coverage/shell-branch-coverage.json` (31/31) and `coverage/ps1-cycle-frontmatter-branch-coverage.json` (7/7).

### Up Next — Rattail Chain (Dependency Order)
The completion rattail chain (`all_tasks_done -> spec-review -> final-review -> final-qa -> proof -> completed`) requires these tasks in order:

1. - [x] [runtime/P1] Add missing rattail prompt templates (`PROMPT_spec-review.md`, `PROMPT_final-review.md`, `PROMPT_final-qa.md`) with `trigger` frontmatter declaring event bindings. (priority: high)
2. - [x] [loop/P1] Add `trigger` frontmatter field to the loop script frontmatter parser (`parse_frontmatter` in loop.sh, `Parse-PromptFrontmatter` in loop.ps1) so the runtime can read trigger declarations from prompt files. (priority: high)
3. - [x] [runtime/P1] Implement generic event -> catalog scan -> queue dispatch in runtime monitor — scan `aloop/templates/` for prompts whose `trigger` field matches the current event, queue them, instead of hardcoded phase-name branching in `monitor.ts:182-270`. (priority: high)
4. - [x] [runtime/P1] Replace hardcoded monitor shortcuts (build→proof, proof→review) with rattail-driven dispatch and ensure monitor exit semantics use `completed` state only after full chain completes. Add tests for rattail success path and "new TODO reopens build" re-entry. (priority: high)

### Up Next — P1 Hardening (After Core)
- [ ] [gh/P1] CI/GitHub Actions integration hardening — enforce CI-first gating in orchestrator/gh loops and add same-error persistence detection before auto re-iteration (stop retrying unchanged CI failures; surface actionable summary). (priority: high)
- [ ] [qa/P1] Packaged-install template bootstrap remains broken in fresh HOME (`aloop setup --non-interactive` / `aloop scaffold` fail with `Template not found .../.aloop/templates/PROMPT_plan.md`). Fix template resolution/bootstrap so packaged CLI works without pre-existing `~/.aloop/templates`. (priority: high)
  - Re-test 2026-03-16 (iter 95): still failing in packaged install (`/tmp/aloop-test-install-KIcuUW/bin/aloop`) with raw stack trace and `Template not found: .../.aloop/templates/PROMPT_plan.md` on `aloop setup --non-interactive --spec SPEC.md --providers copilot` (exit 1).
- [ ] [qa/P1] `aloop gh watch` user flow still fails under PATH hardening (`gh: blocked by aloop PATH hardening`). Keep security boundary while allowing host-side `gh` execution paths required by `aloop gh watch`. (priority: high)
  - Re-test 2026-03-16 (iter 95): still failing (`aloop gh watch --repo owner/repo` => `gh watch failed: gh issue list failed: gh: blocked by aloop PATH hardening`, exit 1).
- [ ] [setup/P1] Data privacy setup flow — ask internal/private vs public/open-source during setup and apply provider/model policy constraints (including ZDR-safe defaults) to generated config. (priority: high)
- [ ] [devcontainer/P1] Devcontainer spec-conformance pass — verify `devcontainer`/`devcontainer-verify` behavior against SPEC Devcontainer acceptance criteria (lifecycle hooks, mounts, provider auth forwarding, verification loop) and close concrete gaps. (priority: high)
- [ ] [qa/P1] `aloop start` auto-monitoring parity — verify dashboard/terminal auto-open and fallback behavior across OS paths; ensure failures degrade with clear manual commands. (priority: medium)

### Up Next — P2
- [ ] [qa/P2] CLI error handling leaks stack traces — `aloop setup --autonomy-level invalid`, `aloop start` (no config), `aloop orchestrate --autonomy-level foo`, `aloop resolve --project-root /nonexistent` should return clean user-facing errors. (priority: medium)
- [ ] [qa/P2] `aloop orchestrate --spec NONEXISTENT.md` still emits raw stack frames in packaged CLI path; return a clean user-facing validation error only. (priority: medium)
  - Re-test 2026-03-16 (iter 95): behavior still PARTIAL — exits 1, but prints raw stack frames from `dist/index.js` instead of a clean validation message.
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
  - Re-test 2026-03-16 (iter 83): screenshot + browser text check at `http://localhost:4040` still show only sessions panel as visibly active (`panel_guess=1`; docs/activity not visible).
  - Re-test 2026-03-16 (iter 95): PASS in current runtime. Playwright check at `http://localhost:4040` returned `panelGuess=6`, `sessions=true`, `docs=true`, `activity=true`; screenshot evidence in session artifacts (`qa-iter84/dashboard-1920x1080-valid.png`).
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
- [x] [loop/P1] **CRITICAL:** `loop.ps1` parity with `loop.sh` restored for `plan -> build x5 -> qa -> review` cycle semantics (mode resolution, cycle advance, required prompts, resume mapping, startup mode text).
- [x] [loop/P1] `loop.sh` resume mapping aligned with 8-step `qa` cycle semantics (removed stale proof-era mapping).
- [x] [review] Gate 2: `project.test.ts` bootstrap assertions strengthened to validate copied template content and `templatesDir` skip path.
- [x] [review] Gate 3: branch-coverage follow-up completed for touched files in `gh.ts`, `devcontainer.ts`, and `lib/project.mjs`.
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
- [~] [qa/P1] `aloop orchestrate --spec NONEXISTENT.md` now fails fast with spec-path validation — superseded/reopened after re-test still showed stack-trace leak; tracked in active P2 error-handling tasks.
- [~] [qa/P1] `aloop setup --non-interactive` fresh-HOME bootstrap fixed — superseded/reopened after packaged-install template bootstrap failure; tracked in active P1 bootstrap task.
- [~] [qa/P1] `aloop gh watch` raw stack-trace crash path hardened with clean user-facing failure handling + gh binary fallback selection — superseded/reopened after PATH-hardening block remained; tracked in active P1 gh-watch task.
- [x] [qa/P1] `aloop devcontainer` commander action-arg mismatch fixed via deps normalization guard.
- [~] [qa/P1] `aloop scaffold` now includes `PROMPT_qa.md` in validation/copy loops — validation remains blocked by packaged-install template bootstrap failure; tracked in active P1 bootstrap task.
- [x] [qa/P1] Provider health backoff report closed as false positive after verification.
- [x] [review] Gate 3: loop runtime cycle/resume branch coverage verified — `shell-branch-coverage.json` (31/31, 100%) and `ps1-cycle-frontmatter-branch-coverage.json` (7/7, 100%) cover all cycle modulo, resume mapping, and frontmatter branches. Remaining uncovered proof-related branches belong to dead code tracked in Gate 4.
