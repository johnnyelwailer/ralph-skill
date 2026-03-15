# Project TODO

## Current Phase: Review Fixes + QA Bug Fixes

Priority: (1) review gate fixes that block iteration, (2) QA P1 bugs, (3) loop decoupling refactor, (4) P2 enhancements.

### In Progress — Review Fixes
- [x] [review] Gate 1: `aloop steer` spec deviation — when `PROMPT_steer.md` exists, queue file contains only template text and omits the user’s steering instruction Fixed: template content now prepended to user instruction in queue file (steer.ts, dashboard.ts, orchestrate.ts). (priority: high)
- [x] [review] Gate 3: `steer.ts` branch coverage — tests exist for most paths but missing coverage for `active.json` omitting `session_dir`/`work_dir` fields (fallback resolution). Add test and verify >=90% branch coverage. (priority: high)
- [ ] [review] Gate 6: proof manifest contains test-output filler (`queue-unlink-verification.txt`, `ansi-strip-verification.txt` with test metadata). Replace with human-verifiable artifacts (real CLI capture for steer flow, visual/log before-after evidence for ANSI rendering), and skip proof for purely internal changes instead of attaching test output. (priority: high)
- [x] [review] Gate 9: README drift remains in Key Features — line ~213 still says “8 review gates”. Update to 9 gates and keep docs consistent across all sections. (priority: high)

### In Progress — QA Bug Fixes

#### P1 — CLI Missing Features
- [ ] [qa/P1] `aloop scaffold` missing `PROMPT_qa.md` — `project.mjs:380` only loops over 5 prompts (plan, build, review, steer, proof); spec requires 9-step pipeline including qa. Add `PROMPT_qa.md` to the scaffold loop. Template exists at `aloop/templates/PROMPT_qa.md`. (iters 52-53, still failing) (priority: high)

#### P1 — Input Validation
- [ ] [qa/P1] `aloop orchestrate --spec NONEXISTENT.md` exits 0 instead of failing — `orchestrate.ts` creates state with `spec_file` without checking if file exists. Add `existsSync()` validation before session creation. (iters 26-53, 8 consecutive fails) (priority: high)
- [~] [qa/P1] Provider health backoff violates spec — QA reported 1 failure triggers ~29h cooldown. **Code verification shows `loop.sh:783-793` correctly implements spec: 1 failure = 0 cooldown, 2 = 2min, etc.** Likely a QA false positive or a different code path in loop.ps1. Mark for re-test. (iters 26-52, 3 reports) (priority: high)

#### P1 — Dashboard
- [ ] [qa/P1] Dashboard docs tabs empty — `/api/state` `workdir` points to `aloop/cli/` subdirectory instead of worktree root, so all docs return zero-length content. Needs runtime verification. (iters 26-51, 4 reports) (priority: high)
- [ ] [qa/P1] Dashboard desktop layout mismatches spec wireframe — at 1920x1080, sidebar and docs panel not visible. Spec requires persistent sidebar + docs + activity. Needs runtime Playwright verification. (iters 47, 51-53, still failing) (priority: high)
- [ ] [qa/P1] Dashboard health tab missing codex — shows 4 providers, codex in cooldown state omitted. (iter 26) (priority: high)

#### P1 — Runtime
- [ ] [qa/P1] `aloop setup --non-interactive` fails for fresh HOME — `setup.ts:47-58` calls `scaffoldWorkspace` without checking if templates exist. Add template existence check and graceful error/bootstrap. (iters 51-53, still failing) (priority: high)
- [ ] [qa/P1] `aloop gh watch` crashes with raw stack trace when `gh` invocation fails — `gh.ts:976` calls `fetchMatchingIssues()` without try-catch. Add error handling around gh CLI calls. (iter 51) (priority: high)

#### P2 — Error Handling / Validation
- [ ] [qa/P2] CLI error handling leaks stack traces — `aloop setup --autonomy-level invalid`, `aloop start` (no config), `aloop orchestrate --autonomy-level foo`, `aloop resolve --project-root /nonexistent`. Should show clean user-facing errors. (iters 46-53, multiple reports) (priority: medium)
- [ ] [qa/P2] `aloop setup` accepts invalid inputs without validation — nonexistent spec files and unknown provider names written to config silently. (iters 48-50) (priority: medium)
- [ ] [qa/P2] `aloop scaffold --spec-files NONEXISTENT.md` writes nonexistent path to config without warning. (iter 52) (priority: medium)
- [ ] [qa/P2] `aloop devcontainer` crashes with `TypeError: deps.discover is not a function`. (iter 50) (priority: medium)

### In Progress — Loop Decoupling (Event-Driven Queue Dispatch)
Goal: the loop engine has ZERO knowledge of specific agents. It just runs cycle + queue. The runtime handles all intelligence (event detection → catalog scan → queue injection).

- [ ] [loop/P1] Remove `FORCE_PLAN_NEXT`, `FORCE_PROOF_NEXT`, `FORCE_REVIEW_NEXT` flags — replace with direct queue writes. When a condition triggers (e.g., all tasks done), write the appropriate prompt file to `$SESSION_DIR/queue/` instead of setting a boolean. (~lines 378-389, 1324-1327) (priority: high)
- [ ] [loop/P1] Remove hardcoded build-completion detection from loop — `register_iteration_success()` checks `iter_mode == “build”` and forces proof+review. Move this to the runtime monitor: detect `all_tasks_done` event → queue proof prompt. (~lines 1977-1984, 512-522) (priority: high)
- [ ] [loop/P1] Remove hardcoded steering detection from loop — loop checks for `STEERING.md` and overrides mode to `steer`, forces plan next. Move to runtime: detect file → queue steer prompt → queue plan prompt. (~lines 1913-1925) (priority: high)
- [ ] [loop/P1] Remove `check_phase_prerequisite()` — hardcodes “can’t review without builds” and “can’t build without tasks” logic for specific agent names. Prerequisites should be the runtime’s responsibility before queueing. (~lines 334-372) (priority: high)
- [ ] [loop/P2] Remove proof/review-specific setup from loop — delete the `if iter_mode == “proof”` artifact-dir block (~lines 2013-2019) and the `if iter_mode == “review”` verdict-injection block (~lines 2022-2033). Instead, substitute `{{SESSION_DIR}}`, `{{ITERATION}}`, and `{{ARTIFACTS_DIR}}` in ALL prompts generically so agents can find/create their own paths. Agents handle their own mkdir and file reads. (priority: medium)
- [ ] [loop/P2] Remove post-iteration hooks — steer archiving, build summary, review baseline update are all hardcoded by agent name (~lines 2046-2095). Move cleanup responsibility to agent prompts themselves — they already know what they need to clean up. (priority: medium)
- [ ] [loop/P2] Make color output data-driven — replace hardcoded `case “$iter_mode” in plan|build|proof|review|steer` with frontmatter `color` field, defaulting to white. (~lines 1966-1973) (priority: low)
- [ ] [loop/P2] Add `trigger` frontmatter field to agent prompt templates — agents declare which events they respond to (e.g., `trigger: all_tasks_done`). Runtime scans catalog for matching triggers when events fire. (priority: medium)
- [ ] [runtime/P2] Implement event→catalog→queue dispatch in runtime monitor — when runtime detects a condition, emit an event key, scan `aloop/templates/` for prompts with matching `trigger` frontmatter, copy to `$SESSION_DIR/queue/`. (priority: medium)

### Up Next — P0/P1 (After Refactor)
- [ ] [gh/P1] CI/GitHub Actions integration hardening — enforce CI-first gating consistently and add same-error persistence checks before re-iteration caps.
- [ ] [setup/P1] Data privacy setup question — ask internal/private vs public/open-source and apply provider/model/ZDR constraints from answer.

### Up Next — P1 (After Core)
- [ ] [dashboard/P1] Proof artifact comparison modes — add before/after comparison UX (side-by-side, slider, diff overlay) and history scrubbing.

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

### Cancelled / Superseded
- [~] [orchestrator/P0] Label-driven state machine — superseded by GitHub-native status/project-state progression with minimal-label fallback.
- [~] [dashboard/low] Docs-tab trigger filtering — already implemented (`App.tsx` filters non-empty docs).
- [~] [qa/P1] Provider health backoff — loop.sh implementation verified correct (1 failure = 0 cooldown). QA report likely false positive or loop.ps1-specific. Re-test needed.

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
