# Project TODO

## Current Phase: P1 Bug Fixes + P2 Orchestrator Backlog

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) P1 hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress
*(All previously in-progress review gates have passed — see Completed section)*

### Up Next — P1 (blocks loop-mode usage)
- [x] [review] Gate 3: **github-monitor.ts branch coverage raised** — added tests for `save()` mkdir guard, `ghApiWithEtag` non-CRLF headers, 304 without cache, non-JSON body parsing, and `fetchBulkIssueState` missing number field validation; verified with 100% success on 33 unit tests. (priority: high) [reviewed: pass — iter 175]
- [x] [qa/P1] `aloop start` fails after fresh packaged-install setup in isolated `HOME`: `Error: Loop script not found: <HOME>/.aloop/bin/loop.sh`. Fixed by extending `scaffoldWorkspace` to bootstrap bundled loop scripts (`loop.sh`, `loop.ps1`) into `~/.aloop/bin` when missing, preserving existing files; added resolver/bootstrap regression tests in `project.test.ts`. (priority: high)


### Up Next — P2 (after P1 bugs and review gates)
- [x] [gh/P2] Agent trunk auto-merge — added `--auto-merge` CLI flag and `auto_merge_to_main` config.yml field; orchestrator creates a PR from `agent/trunk` → `main` when all sub-issues complete and auto-merge is configured; trusted runtime bypasses agent GH policy (agents still cannot target main). Tests for `createTrunkToMainPr`, `resolveAutoMerge`, and scan loop integration. (priority: medium)
- [x] [setup/P2] Dual-mode setup recommendation — analyze spec complexity (workstream count, parallelism potential) and recommend loop vs orchestrator mode, including CI workflow support checks. Implemented `analyzeSpecComplexity`, `detectCIWorkflowSupport`, and `recommendMode` in `project.mjs`; wired into `discoverWorkspace` result; interactive setup shows recommendation and uses it as default mode. Tests: 5 new project tests + 2 new setup tests. (priority: medium)
- [~] [review] Gate 3: `github-webhook.ts` branch coverage at **75.38%** (target >=90%). Cancelled after Gate 4 removed dead `github-webhook.ts` + `github-webhook.test.ts` (module not wired into orchestrator runtime). (priority: medium)

### Deferred (Low Priority / After Core)
- [ ] [qa/P1] Dashboard docs tabs empty in some sessions (`/api/state` docs payload unresolved/empty due context/workdir mismatch reports) — keep deferred until current loop/runtime parity blockers are closed. (priority: low)
- [ ] [review] Gate 7: Dashboard desktop layout mismatch at 1920x1080 persists as a regression in the host dashboard (`visibleAside=false`, no visible sessions/docs/activity tokens). Deferred per SPEC priority note: dashboard polish follows loop/orchestrator core completion. (priority: low)
  - Re-test 2026-03-16 (iter 83): screenshot + browser text check at `http://localhost:4040` still show only sessions panel as visibly active (`panel_guess=1`; docs/activity not visible).
  - Re-test 2026-03-16 (iter 95): PASS in current runtime. Playwright check at `http://localhost:4040` returned `panelGuess=6`, `sessions=true`, `docs=true`, `activity=true`; screenshot evidence in session artifacts (`qa-iter84/dashboard-1920x1080-valid.png`).
  - Re-test 2026-03-17 (iter 106): FAIL in current host dashboard at `http://localhost:4040`; Playwright metrics from `/tmp/qa-dashboard-host-1920x1080.png` show `visibleAside=false`, `hasSessions=false`, `hasDocs=false`, `hasActivity=false` at 1920x1080.
  - Re-test 2026-03-17 (iter 174): FAIL in host dashboard at `http://localhost:4040`; Playwright metrics from `/home/pj/.copilot/session-state/aa6c290a-09a3-45eb-9eed-fc4a07df59a7/files/qa-iter174/dashboard-layout-host.json` show `visibleAside=false`, `panelGuess=2`, `hasSessions=true`, `hasDocs=true`, `hasActivity=false` at 1920x1080. Screenshot: `/home/pj/.copilot/session-state/aa6c290a-09a3-45eb-9eed-fc4a07df59a7/files/qa-iter174/dashboard-1920x1080-host.png`.
  - Re-test 2026-03-16 (isolated packaged install): FAIL when launched from fresh project via `aloop dashboard --port 4141` — UI returns fallback HTML (`Dashboard assets not found at <project>/dashboard/dist`), Playwright metric check shows no visible dashboard panels (`visiblePanels=0`).
- [ ] [qa/P1] Dashboard health tab missing `codex` when no recent codex event exists — likely requires configured-provider-based health baseline, not log-only derivation. (priority: low)
  - Re-test 2026-03-17 (iter 174): PASS on host dashboard (`http://localhost:4040`) — Health tab present and `codex` visible along with `claude`, `gemini`, `copilot`, `opencode` (`/home/pj/.copilot/session-state/aa6c290a-09a3-45eb-9eed-fc4a07df59a7/files/qa-iter174/dashboard-health-host.json`).
- [ ] [dashboard/P1] Proof artifact comparison modes — side-by-side/slider/diff overlay + history scrubbing. (priority: low)
- [~] [qa/P1] Duplicate dashboard-layout task entry superseded by deferred `[review] Gate 7` tracker above (same issue, consolidated to one open task).
- [ ] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard/low] Extend E2E `smoke.spec.ts` coverage for explicit 1920x1080 sidebar/docs/activity visibility checks once core gates are green.

### Cancelled / Superseded
- [~] [orchestrator/P0] Label-driven state machine — superseded by GitHub-native status/project-state progression with minimal-label fallback.
- [~] [dashboard/low] Docs-tab trigger filtering — already implemented (`App.tsx` filters non-empty docs).
- [~] [qa/P1] Provider health backoff — superseded: cooldown behavior in `loop.sh` is correct; remaining cross-platform defect is tracked separately as loop parity tasks.
- [~] [qa/P1] `aloop steer` CLI command missing from `aloop.mjs` help and core list — superseded by broader `aloop.mjs --help` interception fix.

### Completed
- [x] [review] Gate 4: **Copy-paste duplication** — `normalizeCiTextForSignature` (`gh.ts:613-620`) and `normalizeCiGateDetail` (`orchestrate.ts:2620-2627`) are identical functions (`.toLowerCase()`, SHA regex, digit regex, whitespace collapse, `.trim()`). Extracted to shared `lib/ci-utils.ts` and wired both consumers.
- [x] [review] Gate 4: `github-webhook.ts` dead code removed — module and self-only tests deleted because orchestrator runtime uses `github-monitor.ts` polling path; webhook push remains optional SPEC future work.
- [x] [review] Gate 2: `monitor.test.ts:280` — assertion `!files.some(f => f.includes('PROMPT_plan') && f.includes('rattail'))` is a no-op because queue filenames never contain 'rattail'; would pass even if PROMPT_plan was incorrectly queued. Replaced with `!files.some(f => f.includes('PROMPT_plan'))` to verify no plan is queued during normal build cycle.
- [x] [review] Gate 4: dead code removed from loop runtimes — `Update-ProofBaselines` (`aloop/bin/loop.ps1:798`) and `update_proof_baselines` (`aloop/bin/loop.sh:1321`) removed. Resolves Gate 3 proof-branch coverage gaps since those branches existed only in dead functions.
- [x] [runtime/P1] Rattail chain complete — prompt templates (`PROMPT_spec-review.md`, `PROMPT_final-review.md`, `PROMPT_final-qa.md`), trigger frontmatter parsing, generic event dispatch in monitor.ts, rattail-driven dispatch replacing hardcoded shortcuts.
- [x] [gh/P1] CI/GitHub Actions integration hardening — CI-first gating, same-error persistence detection.
- [x] [qa/P1] Packaged-install template bootstrap fixed — multi-layout bundled-template resolver with regression test.
- [x] [qa/P1] `aloop gh watch` PATH hardening fix — case-sensitivity bug in `isPathHardeningBlockedError` + `ALOOP_ORIGINAL_PATH` fallback.
- [x] [setup/P1] Data privacy setup flow — internal/private vs public/open-source with provider/model policy constraints.
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
- [x] [review] Gate 4: **Dead parameter `ConsumeForcedFlags` in `Resolve-IterationMode`** — removed `ConsumeForcedFlags` parameter declaration from `loop.ps1:233` and updated call sites at lines 2048 and 2057; verified with unit tests in `loop.tests.ps1`. (priority: high)
- [x] [review] Gate 1: **`loop.ps1` queue injection parity** — replaced legacy `forceReviewNext` consumption in `Resolve-IterationMode` with queue-override parity comments/flow, added build all-tasks-done queue injection to `001-force-review.md` with `queue_inject` logging, and added regression coverage in `loop.tests.ps1` for both legacy-flag ignore behavior and review queue injection. (priority: high) [reviewed: pass — iter 172]
