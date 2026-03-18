# Project TODO

## Current Phase: Runtime Parity + Orchestrator P1 Closure

Priority order follows SPEC.md: (1) review-fix tasks that block core work, (2) critical loop/runtime parity defects, (3) loop/orchestrator core features, (4) setup/QA hardening, (5) dashboard polish/testing after core loop/orchestrator work is stable.

### In Progress

- [x] [review] Gate 1: `spec-consistency-results` pipeline path mismatch. `queueSpecConsistencyCheck` instructs the agent to write `requests/spec-consistency-results.json` (`orchestrate.ts:4429`), but `processQueuedPrompts` spawns the agent with `--work-dir projectRoot` (`orchestrate.ts:4547`), so the agent writes to `${projectRoot}/requests/` while `runOrchestratorScanPass` reads from `${sessionDir}/requests/spec-consistency-results.json` (`orchestrate.ts:4912`). Fix: pass `sessionDir` as work-dir for the spec-consistency agent so the relative `requests/` path resolves under the session directory. Added regression tests verifying work-dir for both consistency and non-consistency queue files. (priority: high)
- [x] [review] Gate 2: spec-consistency test was shallow/happy-path-only (`orchestrate.test.ts:4091-4122`) — asserts only `specConsistencyProcessed === true` + file unlink. Strengthened with: exact-value assertions for log payload fields (`changes_made`, `issues_found`, `files_modified`, `iteration`), parse-error branch coverage test (logs `spec_consistency_parse_error` and cleans up invalid file), and cleanup-failure edge case test (graceful degradation when unlink throws). (priority: high)

### Up Next
- [x] [qa/P1] [bug] `single` mode parity gap: loop.sh (`resolve_iteration_mode` line 366) and loop.ps1 (`Resolve-IterationMode` line 260) accept and handle `single` mode, but `start.ts:20` (`LOOP_MODE_SET`) does NOT include `single`, so `aloop start --mode single` rejects it before ever reaching the loop scripts. Fixed by adding `'single'` to start-command mode validation/type and extending `compile-loop-plan` cycle support + regression tests (`start.test.ts`, `compile-loop-plan.test.ts`). QA tested at iter 251 — now passing in CLI tests. (priority: high)
- [x] [qa/P1] Orchestrator spec-consistency result processing cannot be triggered or verified by users: the path mismatch (Gate 1 above) means results written by the spec-consistency agent under `projectRoot/requests/` are never read by the orchestrator scan pass reading from `sessionDir/requests/`. This is a symptom of Gate 1 — fixing the path alignment will resolve this. QA tested at iter 251. (priority: high)
- [x] [qa/P2] [bug] Cross-platform PowerShell fake-provider shims — Linux `Get-Command` ignores `.cmd` fake shims so tests may call real provider CLIs; ensure `.cmd` + no-extension shims stay in lockstep for touched test infra. SPEC QA acceptance criteria explicitly requires both Windows shim (`*.cmd`) and POSIX shim (no extension). (priority: medium)

### Deferred (Low Priority / After Core)
- [x] [review] Gate 4: dead variable `callCount` in `aloop/cli/src/commands/devcontainer.test.ts:1248` — remove unused declaration. (priority: low)
- [x] [review] Gate 4: dead parameter `strategy` in `buildProviderRemoteEnv` (`aloop/cli/src/commands/devcontainer.ts:348`) — removed unused parameter and updated call site in `generateDevcontainerConfig`. (priority: low)
- [ ] [setup/P2] [steering] Run a focused UX iteration pass on setup + agent/skill/prompt surfaces across Claude/OpenCode/Copilot/Codex to improve smooth automation while preserving explicit user involvement/confirmation checkpoints. (priority: medium)
- [ ] [dashboard/P1] Implement Proof artifact comparison modes (side-by-side/slider/diff overlay) in dashboard activity artifact viewer; defer until remaining loop/orchestrator core work is complete. (priority: medium)
- [ ] [qa/P1] Dashboard docs tabs empty in some sessions (`/api/state` docs payload unresolved/empty due context/workdir mismatch reports) — keep deferred until current loop/runtime parity blockers are closed. (priority: low)
- [ ] [qa/P1] Dashboard health tab missing `codex` when no recent codex event exists — likely requires configured-provider-based health baseline, not log-only derivation. (priority: low)
- [x] [dashboard/low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums: added 11 new tests for `getRepoUrl` (SSH/HTTPS/no-match), `POST /api/resume` (success/already-running/missing meta), `resolvePid` fallback, `loadArtifactManifests` partial data, `readLogTail` large files, `getContentType` extensions, `readJsonBody` empty/oversized, `resolveDefaultAssetsDir` fallback, and `watch` logic; removed dead code `GH_REQUEST_TYPES`; verified with 49 tests passing in `dashboard.test.ts`. (priority: low)
- [ ] [dashboard/low] Extend E2E `smoke.spec.ts` coverage for explicit 1920x1080 sidebar/docs/activity visibility checks once core gates are green.

### Completed
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
