# Project TODO

## Current Phase: P1 Devcontainer Provider-Source Corrections + P2 Orchestrator Backlog

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) P1 hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress
- [x] [review] Gate 1: `refactor(loop): remove review-verdict.json mechanism` is only half-applied. `aloop/bin/loop.sh` removed verdict-file logic, but `aloop/bin/loop.ps1` still defines and uses review-verdict behavior (`$reviewVerdictFile`, `Reset-ReviewVerdict`, `Get-ReviewVerdict`, `review_verdict_*` events). Restore cross-platform parity by removing/reconciling the PowerShell path to match SPEC and shell behavior. (priority: high) [reviewed: pass]
- [x] [review] Gate 6: Proof manifest (iter 161) updated with CLI capture proof showing `aloop start` no longer crashes with `deps.discoverWorkspace is not a function`. Before/after captures demonstrate resolveStartDeps correctly handles Commander Command object injection. Standalone proof artifact added at `aloop/cli/proof/start-crash-fix-proof.json`. (priority: high)
- [x] [review] Gate 4: `aloop start` crashes in packaged install with `deps.discoverWorkspace is not a function`. Fixed with `isStartDeps` type guard and `resolveStartDeps` resolver (same pattern as devcontainer command). 5 regression tests added. [reviewed: pass]
- [x] [review] Gate 5: Massive test failures (30+ in `loop.tests.ps1` and multiple in shell tests) because the new phase prerequisite rule (missing `TODO.md` forces plan) breaks all tests that verify 'build' mode transitions without first creating a `TODO.md` with an unchecked task. Fixed by adding `ALOOP_SKIP_PHASE_GUARDS=true` to all test invoke functions (both PS1 and bash) that run loop scripts — the phase guards are already tested in a dedicated section. The 7 remaining failures are all pre-existing (loop.sh proof/rat-tail/retry issues unrelated to phase guards). [reviewed: pass]
- [x] [review] Gate 3: Branch coverage evidence missing/failing for `aloop/bin/loop.sh` and `aloop/bin/loop.ps1`. The test harnesses (`loop.tests.ps1` and `loop_branch_coverage.tests.sh`) were fixed to run reliably on Linux by evaluating `derive_mode_from_prompt_name`, hardening `printf` usage, and updating proof-path branch evidence assertions to match current review/queue behavior; validated with passing shell harness (37/37, 100%) and filtered Pester coverage evidence tests (4/4 pass, both proof-path reports >=80%). [reviewed: pass]
- [x] [qa/P2] CLI error handling still leaks stack traces in packaged install for user-facing failures (`aloop start` missing config and invalid argument paths). Fixed by wrapping all commands (including `gh` subcommands) with `withErrorHandling` helper and adding global unhandled rejection handler. (priority: medium)
- [x] [qa/P2] `aloop orchestrate --spec NONEXISTENT.md` still leaks stack trace in packaged install. Fixed by the same global error handling improvements. (priority: medium)
- [x] [review] Gate 9: `README.md` documents `aloop orchestrate --spec SPEC.md` but was not updated to document the new multi-file spec and glob support (e.g., `aloop orchestrate --spec "SPEC.md specs/*.md"`). Update README usage examples to reflect the new feature. (priority: medium)
- [x] [review] Gate 1: `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` phase-prerequisite guards do not enforce `build -> plan` when `TODO.md` is missing/unreadable. [reviewed: pass]
- [x] [review] Gate 2: `aloop/cli/src/commands/project.test.ts` opencode-agent copy test uses non-specific assertions. [reviewed: pass]
- [x] [review] Gate 3: touched file `aloop/cli/src/commands/start.ts` is below branch threshold. [reviewed: pass]
- [x] [review] Gate 4: remove committed debug/repro artifacts. [reviewed: pass]
- [x] [review] Gate 2: `aloop/cli/src/commands/project.test.ts:106-107` existence-only assertions strengthened. [reviewed: pass]
- [x] [review] Gate 3: branch-coverage evidence for `project.mjs` and `setup.ts`. [reviewed: pass]
- [x] [review] Gate 6: proof manifest for iteration 143 verified. [reviewed: pass]
### Up Next — P1 Hardening
- [x] [qa/P1] `aloop setup` non-interactive mode flag missing from SPEC contract — added `--mode` option registration on `setup` CLI, wired non-interactive parsing/validation for `loop|orchestrate` in `setup.ts`, and covered behavior with setup command tests. (priority: high)
- [x] [security/P1] **CLAUDECODE sanitization gap** — already implemented: `index.ts` imports `sanitize.ts` at entry which does `delete process.env.CLAUDECODE`; `loop.sh` and `loop.ps1` unset at script top and before each provider call. All three SPEC entry points covered. Test in `sanitize.test.ts` confirms. (priority: high)
- [x] [devcontainer/P1] Devcontainer spec-conformance pass — verified `devcontainer`/`devcontainer-verify` behavior against SPEC Devcontainer acceptance criteria. Closed concrete gaps: added `opencode` provider to install commands, auth env vars (`OPENCODE_API_KEY`), and CLI binaries for verification; added VS Code extensions (`customizations.vscode.extensions`) for claude and copilot providers; added provider auth verification checks that validate env vars are forwarded inside container; augmented config merges VS Code extensions without duplicates; 19 new tests covering all additions. (priority: high)
- [x] [qa/P1] Packaged install template bootstrap fixed — CLI build now copies bundled templates into `dist/templates` for packaged installs, and regression coverage now verifies `resolveBundledTemplatesDir` resolves `dist/templates` layouts used by packaged binaries. (priority: high)
- [x] [qa/P1] `aloop dashboard` packaged-install asset resolution broken in fresh project — fixed default asset discovery to prioritize packaged runtime-relative locations (module/runtime dist layouts) before cwd fallback, and added regression test that simulates fresh-project cwd + wrapper argv path to ensure dashboard UI loads instead of fallback HTML. (priority: high)
- [x] [qa/P1] `aloop start` auto-monitoring parity — verified dashboard/terminal auto-open and fallback behavior across OS paths (Linux, macOS, Windows); improved failure warning messages to include clear manual commands (`aloop dashboard`, `aloop status --watch`); added 7 new tests covering dashboard spawn failure, browser→terminal fallback, both-fail degradation, terminal-only failure, macOS browser/terminal commands, and Windows Start-Process browser open. (priority: medium)

### Up Next — P2 (after critical gates)
- [~] [review/P2] `forceReviewNext` implemented in loop scripts — superseded: queue injection (`$SESSION_DIR/queue/001-force-review.md`) is now the mandated mechanism per updated SPEC. Old flag approach replaced by queue injection parity task in In Progress.
- [x] [template/P2] Subagent hint templates — verified: `subagent-hints-proof.md` (vision-reviewer, accessibility-checker), `subagent-hints-review.md` (code-critic, vision-reviewer), `subagent-hints-build.md` (error-analyst) all exist with correct subagent lists per phase. (priority: medium)
- [x] [template/P2] Cycle agent templates missing frontmatter — PROMPT_plan.md, PROMPT_build.md, PROMPT_review.md, and PROMPT_qa.md have no YAML frontmatter (no `agent`, `provider`, `model`, `reasoning` fields). This means provider/model/reasoning cannot be configured per-agent at the template level; only compile-time defaults from pipeline config apply. Add frontmatter to match the rattail agent templates (PROMPT_spec-review.md, PROMPT_final-review.md, etc.) which already have proper frontmatter. (priority: medium)
- [x] [template/P2] Shared instruction includes unused in templates — created `aloop/templates/instructions/review.md` and `instructions/qa.md` with shared instruction content; converted PROMPT_review.md, PROMPT_final-review.md, PROMPT_qa.md, and PROMPT_final-qa.md to use `{{include:instructions/review.md}}` and `{{include:instructions/qa.md}}` directives. (priority: medium)
- [x] [template/P2] Default opencode agent files missing — created `aloop/agents/opencode/` with vision-reviewer.md, error-analyst.md, and code-critic.md (correct opencode agent frontmatter with description, mode, model, tools, temperature, maxSteps); added `resolveBundledAgentsDir` and agent copy logic to `scaffoldWorkspace` so `aloop setup` copies them into `.opencode/agents/` when opencode is configured; added tests for resolver and copy behavior. (priority: medium)
- [x] [loop/P2] Phase prerequisite guards not implemented — SPEC requires build phase to verify TODO.md has unchecked tasks (force plan if empty) and review phase to verify commits since last plan (force build if none). Neither `loop.sh` nor `loop.ps1` implement `Check-PhasePrerequisites` or the `phase_prerequisite_miss` log event. Implement defense-in-depth guards in both loop scripts. (priority: medium)
- [x] [qa/P1] `aloop setup --mode orchestrate` ignored in packaged install — fixed setup mode mapping (`orchestrate` now preserved instead of forced to `plan-build-review`), scaffold mode-aware template selection to emit orchestrator prompt set, and regression coverage for non-interactive setup + orchestrate scaffold output/config. (priority: high)
  - Re-test 2026-03-16 (835c6fa): PASS - correctly writes `mode: 'orchestrate'` in generated config.
- [x] [qa/P2] CLI `mode` flag conflict — `aloop setup` uses `--mode` for system mode (loop/orchestrate) but `aloop start` and `aloop scaffold` use it for phase (plan/build/review). Causes `Invalid mode: loop` error in `aloop start` if `mode: loop` is written to config. (priority: medium)
- [x] [qa/P2] `aloop start` fails with "No Aloop configuration found" if config is only in global `~/.aloop/projects/<hash>/` — fixed: config check now accepts global `~/.aloop/config.yml` as fallback when project-specific config is absent.
- [x] [qa/P2] `aloop setup` accepts invalid inputs without validation — nonexistent spec files and unknown provider names are written silently. Implemented `validateProviders` and `validateSpecFiles` in `project.mjs`, called from `scaffoldWorkspace` before writing any files. Both `setup` and `scaffold` paths validated since they share the same `scaffoldWorkspace` entry point. (priority: medium)
- [x] [qa/P2] `aloop scaffold --spec-files NONEXISTENT.md` writes nonexistent path to config without warning. Fixed by the same `validateSpecFiles` validation in `scaffoldWorkspace` that rejects nonexistent spec file paths before writing config. (priority: medium)
- [x] [orchestrator/P2] Multi-file spec support — `specs/*.md` globbing, merge logic, master-spec + vertical-slice-group pattern. Implemented `resolveSpecFiles` (space/comma-separated glob patterns) and `loadMergedSpecContent` (multi-file merge with file-name headers); wired into `orchestrateCommandWithDeps` for decomposition and gap analysis; added `spec_files` to `OrchestratorState`; 14 new tests. (priority: medium)
- [~] [qa/P1] `aloop devcontainer` omits `OPENCODE_API_KEY` from `remoteEnv` and opencode CLI install from `postCreateCommand` even when opencode is explicitly configured as a provider (`--providers "claude,opencode"`). Superseded by root-cause tasks below: provider source-of-truth and discovery parity.
- [x] [qa/P1] Devcontainer generation and verify flows must resolve providers from project config (`enabled_providers` / resolved runtime provider set), not `discoverWorkspace.providers.installed`. Implemented provider resolution from project `config.yml` (`enabled_providers`, `provider`, `round_robin_order`) with fallback to discovered providers, wired it into both generation and verify flows, and added regression tests for configured-but-not-locally-installed providers. (priority: high)
- [x] [qa/P1] Provider discovery parity: `aloop/cli/lib/project.mjs:getInstalledProviders()` now includes `opencode`, and `discoverWorkspace` defaults include `opencode-default` model. Added regression tests covering detection, scaffolded config defaults, and host-side binary-missing robustness. (priority: high)
- [x] [qa/P1] Devcontainer auth preflight warnings for activated providers are missing. Implemented `checkAuthPreflight` in `devcontainer.ts` — checks host env for each provider's auth vars (with Claude preference: `CLAUDE_CODE_OAUTH_TOKEN` then `ANTHROPIC_API_KEY`), returns actionable guidance, and prints warnings before "Next steps" in CLI output. 8 new tests. (priority: high)
- [ ] [orchestrator/P2] Efficient GitHub monitoring — ETag-guarded REST change detection, targeted GraphQL full-state fetch, `since` filtering, optional webhook push. (priority: medium)
- [ ] [orchestrator/P2] Devcontainer routing — per-task `sandbox: container|none`, `requires: [windows, macos, gpu]`, dispatcher host-capability checks. (priority: medium)
- [ ] [gh/P2] Agent trunk auto-merge — auto-merge policy in config, human-only approval for `agent/trunk -> main`, default `agent/main` creation. (priority: medium)
- [ ] [setup/P2] Dual-mode setup recommendation — analyze scope and recommend loop vs orchestrator mode, including CI workflow support checks. (priority: medium)

### Deferred (Low Priority / After Core)
- [ ] [qa/P1] Dashboard docs tabs empty in some sessions (`/api/state` docs payload unresolved/empty due context/workdir mismatch reports) — keep deferred until current loop/runtime parity blockers are closed. (priority: low)
- [ ] [review] Gate 7: Dashboard desktop layout mismatch at 1920x1080 persists as a regression in the host dashboard (`visibleAside=false`, no visible sessions/docs/activity tokens). Deferred per SPEC priority note: dashboard polish follows loop/orchestrator core completion. (priority: low)
  - Re-test 2026-03-16 (iter 83): screenshot + browser text check at `http://localhost:4040` still show only sessions panel as visibly active (`panel_guess=1`; docs/activity not visible).
  - Re-test 2026-03-16 (iter 95): PASS in current runtime. Playwright check at `http://localhost:4040` returned `panelGuess=6`, `sessions=true`, `docs=true`, `activity=true`; screenshot evidence in session artifacts (`qa-iter84/dashboard-1920x1080-valid.png`).
  - Re-test 2026-03-17 (iter 106): FAIL in current host dashboard at `http://localhost:4040`; Playwright metrics from `/tmp/qa-dashboard-host-1920x1080.png` show `visibleAside=false`, `hasSessions=false`, `hasDocs=false`, `hasActivity=false` at 1920x1080.
  - Re-test 2026-03-16 (isolated packaged install): FAIL when launched from fresh project via `aloop dashboard --port 4141` — UI returns fallback HTML (`Dashboard assets not found at <project>/dashboard/dist`), Playwright metric check shows no visible dashboard panels (`visiblePanels=0`).
- [ ] [qa/P1] Dashboard health tab missing `codex` when no recent codex event exists — likely requires configured-provider-based health baseline, not log-only derivation. (priority: low)
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
