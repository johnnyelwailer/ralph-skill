# Project TODO

## Current Phase: Runtime Parity + Orchestrator P1 Closure

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) setup/QA hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress
No active tasks in progress.

### Up Next
No additional non-deferred tasks until the active Phase closure is complete.

### Deferred (Low Priority / After Core)
- [ ] [qa/P1] Dashboard docs tabs empty in some sessions (`/api/state` docs payload unresolved/empty due context/workdir mismatch reports) — keep deferred until current loop/runtime parity blockers are closed. (priority: low)
- [ ] [qa/P1] Dashboard health tab missing `codex` when no recent codex event exists — likely requires configured-provider-based health baseline, not log-only derivation. (priority: low)
- [ ] [dashboard/low] Extend E2E `smoke.spec.ts` coverage for explicit 1920x1080 sidebar/docs/activity visibility checks once core gates are green.

### Completed
- [x] [review] Gate 3: no branch-coverage evidence for touched UI file `aloop/cli/dashboard/src/AppView.tsx`. New comparison branches (no-baseline path, baseline selection, side-by-side vs slider, slider interactions) remain below gate threshold. Add targeted tests and publish branch coverage >=80% for `AppView.tsx`. (priority: medium — dashboard testing) — **COMPLETED** (iter 288; `aloop/cli/dashboard/coverage/coverage-summary.json` reports `AppView.tsx` at 82.09% branch / 90.2% statements)
- [x] [qa/P1] [bug] `aloop devcontainer` opencode missing: fixed `devcontainer.ts` to include `OPENCODE_API_KEY` in `remoteEnv` and opencode install in `postCreateCommand` when opencode is configured. (priority: high) — **COMPLETED** (verified in code paths `buildProviderRemoteEnv`, `buildProviderInstallCommands`, `resolveConfiguredProviders`; regression evidence: `cd aloop/cli && npx --yes tsx --test src/commands/devcontainer.test.ts` => 135/135 pass including opencode-specific tests)
- [x] [qa/P1] [bug] `single` mode parity gap: fix end-to-end support for `single` mode by adding `PROMPT_single.md` template to `project.mjs`, removing normalization in `project.mjs` and `start.ts`, and fixing `loop.sh` one-shot logic. (priority: high) — **COMPLETED** (added `PROMPT_single.md` template, added to `LOOP_PROMPT_TEMPLATES`, removed normalization in `project.mjs:normalizeScaffoldMode`, `start.ts:resolveConfiguredStartMode`, fixed `loop.sh` one-shot passthrough to match `loop.ps1`, updated `start.test.ts` assertions)
- [x] [qa/P1] [bug] `aloop start` stale runtime warning: fix git comparison in `start.ts` to check `aloop` source repo metadata instead of target project repo HEAD. (priority: high) — **COMPLETED** (added `isAloopRepo` and `findAloopRepoRoot` helpers, updated staleness check to only compare against `aloop` source repo HEAD, and added regression tests in `start.test.ts`)
- [x] [review] Gate 6: iteration 286 proof manifest incorrectly marks `single` mode normalization as internal-only and provides no human-verifiable evidence. This change is externally observable (`aloop setup/start --mode single` no longer fails with `Invalid mode: single`), so add packaged-install before/after CLI captures (or equivalent CLI recording) showing old failure vs current behavior. (priority: high) — **COMPLETED** (iter 287; proof: `aloop/cli/proof/single-mode-proof.json`)
- [x] [review] Gate 2: `findBaselineIterations` tests are tautological due local duplication. `aloop/cli/dashboard/src/App.test.tsx:1376-1434` defines a separate test-local `findBaselineIterations` instead of importing production logic from `AppView.tsx`, so tests can pass while runtime logic regresses. Replaced with tests against exported production function while preserving ordering/filtering assertions. Also hardened coupled CLI tests (`update.test.ts`, `aloop.test.mjs`) for isolated TMPDIR/Git-ceiling behavior needed for required backpressure checks. (priority: medium — dashboard testing) — **COMPLETED** (iter 254)
- [x] [qa/P1] Fix scaffold template regression after single-mode parity: `scaffoldWorkspace` now requires `PROMPT_single.md` only for `mode: single` (not all loop modes), restoring loop-mode template compatibility while preserving single-mode support. (priority: high)
- [x] [review] Gate 1: dashboard comparison widget now meets SPEC comparison requirements with all three comparison modes (`Side by Side`, `Slider`, `Diff Overlay`) in the artifact dialog. Implemented `diff-overlay` mode in `AppView.tsx`, exported the dialog from `App.tsx` for testability, and added behavior coverage in `App.coverage.test.ts` for mode switching/rendering and overlay opacity control. Verified with `cd aloop/cli/dashboard && npm test` and required backpressure checks (`cd aloop/cli && npm test && npm run type-check && npm run build`) using external `TMPDIR` due host `/tmp` capacity. (priority: medium — dashboard polish, deferred per SPEC priority note)
- [x] [cleanup/P1] Remove hallucinated `single` mode — most files already cleaned in prior iterations; removed last remnant: `mode.single` branch coverage test block from `loop_branch_coverage.tests.sh` (lines 566-578) and empty section header. Verified no remaining `single` mode references in any source or test file. (priority: high)
- [x] [review] Gate 5: fix `aloop/cli` test isolation so repository-level git discovery does not leak into temp-fixture tests (`discoverWorkspace resolves project details`, `scaffoldWorkspace expands nested template includes`, etc.). Ensure temp repos are explicitly isolated from repository root using `GIT_CEILING_DIRECTORIES` in `project.test.ts` and `index.test.ts`. (priority: critical) — **COMPLETED** (iter 253).
- [x] [review] Gate 1: `single` mode parity gap in packaged install resolved. Normalized stale `single` references to `loop` mode (`plan-build-review`) across `setup`, `start`, and `loop.sh` runtime paths. Updated `start.test.ts` and `setup.test.ts` with regression coverage. (priority: high) — **COMPLETED** (iter 253).
- [x] [review] Gate 5: required validation command now completes cleanly. Implemented explicit EventSource listener teardown before `close()` in `AppView.tsx cleanup/reconnect paths, and added `dashboard.test.ts` suite teardown cleanup for lingering `FSWatcher` handles so Node test process exits deterministically. Verified `cd aloop/cli && npm test && npm run type-check && npm run build` completes successfully. (priority: high)
- [x] [review] Gate 1: `spec-consistency-results` pipeline path mismatch — fixed work-dir for spec-consistency agent so relative `requests/` path resolves under the session directory. Added regression tests. (priority: high)
- [x] [review] Gate 2: spec-consistency test strengthened with exact-value assertions, parse-error branch coverage, and cleanup-failure edge case. (priority: high)
- [x] [qa/P1] Orchestrator spec-consistency result processing path mismatch resolved (symptom of Gate 1 fix). QA tested at iter 251. (priority: high)
- [x] [qa/P2] [bug] Cross-platform PowerShell fake-provider shims — ensured `.cmd` + no-extension shims stay in lockstep for test infra. (priority: medium)
- [x] [review] Gate 4: dead variable `callCount` in `devcontainer.test.ts:1248` removed. (priority: low)
- [x] [review] Gate 4: dead parameter `strategy` in `buildProviderRemoteEnv` removed. (priority: low)
- [x] [setup/P2] [steering] Interactive setup confirmation checkpoint with adjustment loop + cancel-without-write + expanded provider hints. (priority: medium)
- [x] [dashboard/P1] Proof artifact comparison modes (side-by-side/slider) with history scrubbing, baseline auto-detection, diff badge, keyboard nav. (priority: medium)
- [x] [dashboard/low] Raise/verify `dashboard.ts` branch coverage — 11 new tests, 49 total passing. (priority: low)
- [x] [review] Gate 4: committed binary artifact `aloop/cli/aloop-cli-1.0.0.tgz` (321KB npm tarball) tracked in git — removed from repo and added `*.tgz` to `.gitignore`. (priority: high)
- [x] [orchestrator/P1] Implement Spec Consistency result processing: consume `requests/spec-consistency-results.json` in `runOrchestratorScanPass` and apply state/log actions so queued consistency checks have runtime effect. (priority: medium)
- [x] [setup/P1] Implement ZDR provider warnings in setup confirmation for org-level/provider-level constraints (Claude, Gemini, OpenAI, Copilot) with docs links so private-mode users get accurate risk guidance. (priority: medium)
- [x] [opencode/P1] [steering] Implement basic token/price tracking for OpenCode/OpenRouter: added `extract_opencode_usage()` in loop.sh/loop.ps1 to parse usage via `opencode export` CLI after each opencode iteration; extended `iteration_complete` events with optional `tokens_input`, `tokens_output`, `tokens_cache_read`, `cost_usd` fields; updated `parseChildSessionCost` in orchestrate.ts to use real cost when available (fallback to estimate otherwise); added dashboard usage row in expanded iteration details; 9 new tests across orchestrate.test.ts and App.coverage.test.ts. (priority: high)
- [x] [review] [runtime/P1] [bug] Enforce steering priority over forced final review queue items: current loop queue ordering is lexicographical and steering uses timestamped names, so review can run before steering. Updated `loop.sh`, `loop.ps1`, and `orchestrate.ts` to explicitly prioritize steering prompts (*-PROMPT_steer.md, *-steering.md) in the queue. (priority: critical)
- [x] [orchestrator/P1] Implement Orchestrator Review Layer: add `PROMPT_orch_review.md` and wire `invokeAgentReview` path so post-child PR review enforces spec compliance/proof quality before merge. (priority: high)
- [x] [orchestrator/P1] Implement Refinement Budget Cap: add `refinement_count` to `OrchestratorIssue`, increment on DoR failure, and enforce cap of 5 with autonomy-based auto-resolve vs wait behavior so refinement loops cannot spin forever. (priority: high)
- [x] [runtime/P1] [steering] Set default execution-control provider timeout to 3 hours (10800s) in both `loop.sh` and `loop.ps1`, preserving precedence (`prompt timeout` -> `ALOOP_PROVIDER_TIMEOUT` -> built-in default) and adding parity regression coverage. (priority: high)
- [x] [review] Gate 1: default execution-control timeout parity verified across runtimes — `loop.sh` and `loop.ps1` both default to `10800` seconds (3 hours) with precedence `prompt timeout` -> `ALOOP_PROVIDER_TIMEOUT` -> built-in default. (priority: high)
- [x] [review] Gate 1: `devcontainerCommandWithDeps` computes auth-file fallback mounts with `deps.existsSync`, but `checkAuthPreflight` is called without `existsFn`/`homeDir` (`aloop/cli/src/commands/devcontainer.ts:620`), so it still warns even when fallback auth files exist. Wire `deps.existsSync` + resolved host home into `checkAuthPreflight` and add a regression test that asserts no warning when a mountable auth file is present. (priority: high)
- [x] [review] Gate 2: `buildProviderAuthFileMounts - default existsFn uses real filesystem` is a shallow assertion (`assert.ok(Array.isArray(mounts))`) in `aloop/cli/src/commands/devcontainer.test.ts:1482-1486`. Replace with concrete assertions by controlling HOME + fixture file presence/absence and checking exact mount count/content. (priority: medium)
- [x] [review] Gate 3: touched UI file `aloop/cli/dashboard/src/App.tsx` lacks branch-coverage evidence for this iteration (and dashboard coverage run currently fails with missing `@vitest/coverage-v8`). Added dashboard coverage tooling (`@vitest/coverage-istanbul`) and App export coverage tests; latest dashboard run reports `App.tsx` branch coverage at **100%** (`npm run test:coverage`). (priority: high)
- [x] [review] Gate 6: iteration-209 proof manifest includes test-output artifact `test-install-output.txt` (`type: cli_output`), which is invalid filler for proof; replace with human-verifiable evidence only (e.g., packaged install CLI capture focused on behavior and screenshots/recordings) or explicitly skip proof when change is internal. (priority: high)
- [x] [review] Gate 1/2: The fix for `[qa/P1] aloop start fails...` in `1ff36db` is physically broken because `aloop/bin/` loop scripts are omitted from the npm package (tarball only includes `dist/`). The test added (`resolveBundledBinDir resolves...`) manually creates a fake `aloop/bin/loop.sh`, creating a false positive. Fix `package.json` build steps to include or copy the `bin/` directory, and update the test to verify actual package contents (or ensure the E2E `test-install` script validates loop script presence). (priority: high)
- [x] [review] Gate 5: `aloop/cli/src/index.test.ts` test `index CLI catches errors and prints clean messages without stack traces` fails in isolation/coverage because it relies on `SPEC.md` existing in `process.cwd()`. If it's missing, orchestrate throws a "No spec files" error before checking autonomy level. Refactor the test to use a temporary directory with a mock `SPEC.md`. (priority: high)
- [x] [review] Gate 1: `project.mjs` setup-mode recommendation overcounts complexity due to substring keyword collisions (`infra` + `infrastructure`, `auth` + `authentication`) and CI test detection treating generic `check` matches as test evidence (`checkout` false positive). Fix: replace substring `.includes()` matching in `analyzeSpecComplexity` with normalized category-level deduplication (group synonyms like `infra`/`infrastructure` into one category), and tighten CI classification in `detectCIWorkflowSupport` to use word-boundary or job-level semantics instead of raw `.includes('check')`. (priority: high) [reviewed: pass — iter 198]
- [x] [review] Gate 2: add regression tests for recommendation correctness edge cases in `project.test.ts` — (a) overlapping workstream synonyms should count once (spec with both `Auth` and `Authentication` headers → `workstream_count` should not double-count), (b) workflow content containing `actions/checkout` without test jobs must not set `ci_support.workflow_types` to include `test`, (c) recommendation should stay `loop` for simple spec + non-test workflow. Use exact assertions on `workstream_count`, `workflow_types`, and `recommended_mode`. (priority: high) [reviewed: pass — iter 198]
- [x] [devcontainer/P2] [steering] Implement provider auth fallback mounts in `devcontainer.ts` per SPEC.md § "Provider Auth in Container > Fallback: Auth File Bind-Mounts": for each activated provider resolve auth as `env var -> auth file bind-mount -> warn`. Mount only the specific auth file, never the whole provider config directory. (priority: high)
- [x] [qa/P1] Re-validate packaged-install `aloop setup` + `aloop start` in isolated `HOME` after Gate 1 fix lands, and capture a regression proof that loop scripts are bootstrapped from the installed package (not repo-local fixtures). (priority: high)
- [x] [review] Gate 7: Dashboard desktop layout mismatch at 1920x1080 fixed.
- [x] [dashboard/low] Broader unit coverage expansion for `App.tsx` interaction paths — added tests for `numStr`, `toSession`, `formatSecs`, `formatDuration`, `relativeTime`, `stripAnsi`, `isImageArtifact`, `artifactUrl`, `slugify`, and `parseManifest` (68 new test cases).
- [x] [review] Gate 3: **github-monitor.ts branch coverage raised** — added tests for `save()` mkdir guard, `ghApiWithEtag` non-CRLF headers, 304 without cache, non-JSON body parsing, and `fetchBulkIssueState` missing number field validation; verified with 100% success on 33 unit tests. (priority: high) [reviewed: pass — iter 175]
- [x] [gh/P2] Agent trunk auto-merge — added `--auto-merge` CLI flag and `auto_merge_to_main` config.yml field; orchestrator creates a PR from `agent/trunk` → `main` when all sub-issues complete and auto-merge is configured; trusted runtime bypasses agent GH policy (agents still cannot target main). Tests for `createTrunkToMainPr`, `resolveAutoMerge`, and scan loop integration. (priority: medium)
- [x] [setup/P2] Dual-mode setup recommendation — analyze spec complexity (workstream count, parallelism potential) and recommend loop vs orchestrator mode, including CI workflow support checks. Implemented `analyzeSpecComplexity`, `detectCIWorkflowSupport`, and `recommendMode` in `project.mjs`; wired into `discoverWorkspace` result; interactive setup shows recommendation and uses it as default mode. Tests: 5 new project tests + 2 new setup tests. (priority: medium)
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
- [x] [review] Gate 4: **Dead parameter `ConsumeForcedFlags` in `Resolve-IterationMode`** — removed `ConsumeForcedFlags` parameter declaration from `loop.ps1:233` and updated call sites at lines 2048 and 2057; verified with unit tests in `loop.tests.ps1`. (priority: high)
- [x] [review] Gate 1: **`loop.ps1` queue injection parity** — replaced legacy `forceReviewNext` consumption in `Resolve-IterationMode` with queue-override parity comments/flow, added build all-tasks-done queue injection to `001-force-review.md` with `queue_inject` logging, and added regression coverage in `loop.tests.ps1` for both legacy-flag ignore behavior and review queue injection. (priority: high) [reviewed: pass — iter 172]
