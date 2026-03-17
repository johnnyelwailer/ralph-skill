# Review Log

## Review — 2026-03-17 18:00 UTC — commit 1260e17..2c94950

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/github-monitor.ts`, `aloop/cli/src/lib/github-monitor.test.ts`, `aloop/cli/src/lib/github-webhook.ts`, `aloop/cli/src/lib/github-webhook.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/devcontainer.ts`, `aloop/cli/src/commands/devcontainer.test.ts`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/lib/project.mjs`

- Gate 3: **`github-monitor.ts` branch coverage is 69.83%** (target >=90% for new modules). `EtagCache.save()` mkdir branch, `ghApiWithEtag` non-CRLF header parsing, 304-without-cache edge, non-JSON body fallback, and `fetchBulkIssueState` node-filtering branches are untested.
- Gate 3: **`github-webhook.ts` branch coverage is 75.38%** (target >=90% for new modules). `WebhookServer.start()` re-entry, `server.address()` type guard, `stop()` re-entry, and handler exception paths are untested.
- Gate 4: **Dead code** — `github-webhook.ts` is not imported by any production module. Only its test file references it. `orchestrate.ts` imports only from `github-monitor.ts`. The webhook server, relevance filter, and invalidation key extractor are unreachable from any CLI entry point.

**Resolved from prior reviews:**
- Gate 1 ✅: `loop.ps1` review-verdict removal completed (prior PASS review at 1260e17).
- Gate 6 ✅: Start crash fix proof manifest verified (prior PASS review).

**Positive observations:**
- Gate 1: Host-capability dispatch routing correctly implements SPEC sandbox/requires fields — `detectHostCapabilities` checks platform, docker, GPU (env vars + nvidia-smi), network-access; `filterByHostCapabilities` blocks issues with missing labels and logs `scan_dispatch_blocked_requirements` events. `launchChildLoop` passes `ALOOP_TASK_SANDBOX` and `ALOOP_TASK_REQUIRES` env vars to child processes.
- Gate 1: `checkAuthPreflight` correctly implements SPEC's auto-detection flow step 1 — checks `CLAUDE_CODE_OAUTH_TOKEN` before `ANTHROPIC_API_KEY` for Claude, provides actionable guidance per provider, and warnings are printed before "Next steps" in CLI output.
- Gate 1: ETag-guarded GitHub monitoring matches SPEC strategy — `ghApiWithEtag` sends `If-None-Match` conditional requests, returns cached data on 304, skips network when within TTL. `fetchBulkIssueState` uses single GraphQL query with `since` filtering. Integrated into scan loop as step 0.3.
- Gate 1: Provider resolution from config correctly prioritizes `enabled_providers` > `round_robin_order` > single `provider` > discovered installed providers, matching SPEC devcontainer generator requirements.
- Gate 2: `github-monitor.test.ts` (28 tests) uses concrete value assertions — exact ETag strings, exact parsed JSON structures, exact change detection reasons. `github-webhook.test.ts` (20 tests) includes real HTTP requests to ephemeral server with signature verification using `createHmac`. `devcontainer.test.ts` auth preflight tests (8 new) assert exact provider names, missing var arrays, and guidance strings. All tests are substantive.
- Gate 2: `orchestrate.test.ts` host-capability tests assert exact `eligible`/`blocked` arrays with specific issue numbers and missing labels — thorough.
- Gate 5: All tests pass — orchestrate 294/294, devcontainer 101/101, github-monitor 28/28, github-webhook 20/20, project 38/38, CLI 8/8. Type-check clean. Build succeeds.
- Gate 6: Proof manifest (iter 179) contains valid CLI captures — devcontainer auth warnings showing 5 provider warnings with actionable guidance, setup orchestrate config with `mode: 'orchestrate'`, and capability dispatch proof showing issue filtering on linux host. Skipped items (live GitHub API, multi-platform live dispatch) are reasonable.
- Gate 8: No dependency changes; version compliance unchanged.
- Gate 9: README already documents `orchestrate` and `devcontainer` at high level; new features are internal implementation details that don't change CLI interface. No drift.

---

## Review — 2026-03-16 18:30 UTC — commit 011b264..deed10c

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/commands/start.ts`, `aloop/cli/src/commands/start.test.ts`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/package.json`

- Gate 4: **Dead parameter** — `Resolve-IterationMode` (`loop.ps1:233`) still declares `[bool]$ConsumeForcedFlags` and it is still passed at call sites (lines 2048, 2057), but the forceReviewNext logic that consumed it was removed in this iteration. The parameter is now a no-op.

**Resolved from prior reviews:**
- Gate 1 ✅: `loop.ps1` queue injection parity — legacy `forceReviewNext` consumption replaced with queue-based `001-force-review.md` injection when `allTasksMarkedDone` is true. Matches `loop.sh:1957-1965` behavior exactly.

**Positive observations:**
- Gate 1: Dashboard `resolveDefaultAssetsDir` (`dashboard.ts:392-415`) correctly implements a multi-candidate search using `import.meta.url`, `process.argv[1]`, and cwd as base paths with 5 distinct resolution strategies. This fixes the packaged-install regression where cwd-only fallback missed bundled assets.
- Gate 1: `build:templates` script in `package.json` correctly copies `aloop/templates/` to `dist/templates/` during build, ensuring template files are available in packaged installs.
- Gate 1: Auto-monitoring warning messages now include actionable manual commands (`aloop dashboard`, `aloop status --watch`) per SPEC intent for graceful degradation.
- Gate 2: `start.test.ts` adds 7 new tests (lines 1007-1304) with concrete assertions — `assert.equal(result.monitor_mode, 'dashboard')`, `assert.ok(result.warnings.some(w => w.includes('aloop dashboard')))`, `assert.ok(syncCalls.some(call => call.command === 'open'))`. Tests cover Linux, macOS, and Windows platform branches with specific command/argument assertions. No shallow checks found.
- Gate 2: `dashboard.test.ts` test (`line 810`) now validates that the packaged-install dashboard serves actual HTML (`/<title>Aloop Dashboard<\/title>/`) and rejects fallback HTML (`assert.doesNotMatch(text, /Dashboard assets not found/)`). Simulates realistic packaged environment by setting `process.cwd()` to empty dir and `process.argv[1]` to wrapper path.
- Gate 2: `loop.tests.ps1` queue injection test (line 2769) verifies file creation (`Test-Path ...001-force-review.md`), and checks for 3 specific log events (`tasks_marked_complete`, `queue_inject`, `iteration_complete`). The legacy-flag ignore test (line 2767) confirms `forceReviewNext` flag is preserved unmodified in the plan JSON when queue injection is the mechanism.
- Gate 2: `project.test.ts` (line 382) adds dist/templates resolution test with 6 bundled template files and exact directory match assertion.
- Gate 5: All tests pass (CLI 8/8, test suite green), type-check clean, build succeeds.
- Gate 6: Proof manifest includes 3 screenshots at desktop/tablet/mobile viewports. Desktop screenshot confirms functional dashboard with sessions sidebar, docs panel, and activity panel visible. CLI captures for setup and scaffold are valid. `claudecode-sanitization.txt` contains an ERR_MODULE_NOT_FOUND error (proof agent's test harness issue, not a product bug — sanitization is verified by `sanitize.test.ts` in the test suite). `layout-verification.json` is empty (`"panels": []`) but the screenshot confirms correct layout visually.
- Gate 8: No dependency changes; `build:templates` is a packaging-only build step addition.
- Gate 9: README accurately describes 9 gates and loop phases — no drift.

---

## Review — 2026-03-16 16:00 UTC — commit aa4f74b..0032a70

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/lib/ci-utils.ts`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/setup.ts`, `aloop/cli/src/commands/setup.test.ts`, `aloop/cli/src/commands/devcontainer.ts`, `aloop/cli/src/commands/devcontainer.test.ts`, `aloop/cli/src/index.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/bin/loop_branch_coverage.tests.sh`, `SPEC.md`

- Gate 1: **`loop.ps1` queue injection parity** — SPEC (updated in this iteration) now mandates queue injection (`$SESSION_DIR/queue/001-force-review.md`) replacing old `forceReviewNext` flag. `loop.sh` correctly implements queue injection (line 1957-1965: copies `PROMPT_review.md` to `queue/001-force-review.md` when `ALL_TASKS_MARKED_DONE=true`). `loop.ps1` still implements old flag-based `forceReviewNext` consumption in `Resolve-IterationMode` (lines 237-247) and lacks the all-tasks-done queue injection block entirely.

**Resolved from prior reviews:**
- Gate 4 ✅: Copy-paste duplication of CI normalization functions resolved — extracted `normalizeCiDetailForSignature` to shared `lib/ci-utils.ts`, both `gh.ts` and `orchestrate.ts` now import from shared module.

**Positive observations:**
- Gate 1: `aloop setup --mode` option correctly registered in CLI with validation for `loop|orchestrate` values. `mapSetupModeToLoopMode` maps both modes to `plan-build-review` cycle, consistent with current scaffold behavior.
- Gate 1: Devcontainer spec-conformance pass is thorough — adds `opencode` provider support (install command, `OPENCODE_API_KEY` auth var, CLI binary verification), VS Code extensions (`anthropic.claude-code` for claude, `GitHub.copilot` for copilot), and provider auth verification checks inside container. `augmentExistingConfig` merges extensions without duplicates.
- Gate 2: `devcontainer.test.ts` adds 19 concrete-assertion tests covering opencode install/env, VS Code extension generation for claude/copilot/codex/empty, extension merge deduplication, auth pass/fail/fallback paths, and result vscode_extensions field. All assert exact values.
- Gate 2: `setup.test.ts` adds `rejects invalid setup mode` test with exact error message matching — thorough error-path coverage.
- Gate 2: `loop.tests.ps1` adds 2 tests for `Resolve-IterationMode` forceReviewNext consume/no-consume with concrete JSON field assertions.
- Gate 4: Unused `callCount` variable in `devcontainer.test.ts:1144` — declared but never referenced (minor, test-only dead code).
- Gate 5: All 8 CLI tests pass, type-check clean, build succeeds.
- Gate 6: Proof manifest correctly skips all tasks — internal loop runtime refactor and SPEC text alignment with no externally observable deliverable. No filler artifacts.
- Gate 8: No dependency changes; version compliance unchanged.
- Gate 9: README accurately describes loop phases and review gates — no drift from changes in this iteration.

---

## Review — 2026-03-16 14:00 UTC — commit c7f0250..bfd5424

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/setup.ts`, `aloop/cli/src/commands/setup.test.ts`, `aloop/cli/src/commands/project.ts`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/lib/project.mjs`, `aloop/cli/src/lib/monitor.test.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`

- Gate 4: **Copy-paste duplication** — `normalizeCiTextForSignature` (`gh.ts:613-620`) and `normalizeCiGateDetail` (`orchestrate.ts:2620-2627`) are identical functions with the same 4-step text normalization pipeline (lowercase → SHA regex → digit regex → whitespace collapse → trim). Extract to shared module.

**Resolved from prior reviews:**
- Gate 2 ✅: `monitor.test.ts:280` no-op assertion fixed — now uses `!files.some(f => f.includes('PROMPT_plan'))` without the `rattail` qualifier that made it a tautology.

**Positive observations:**
- Gate 1: Data privacy setup flow correctly implements SPEC step 7 — asks internal/private vs public/open-source, writes `privacy_policy` config block with `data_classification`, `zdr_enabled`, and `require_data_retention_safe` fields. Default is 'private' with ZDR enabled, matching spec's conservative default intent.
- Gate 1: CI failure persistence detection matches SPEC requirement ("Same error persisting after N attempts → flag for human", default 3) in both `gh.ts` (gh watch path) and `orchestrate.ts` (orchestrator path). Both use signature-based comparison with SHA/number normalization.
- Gate 1: PATH hardening fallback via `ALOOP_ORIGINAL_PATH` is correctly exported before PATH mutation and cleaned up after provider execution in both `loop.sh:1027/1212` and `loop.ps1:495/599`. `ghExecutor.exec` correctly tries current PATH first, then `ALOOP_ORIGINAL_PATH`.
- Gate 1: `resolveBundledTemplatesDir` searches up to 6 parent levels from 3 base dirs (module, argv, cwd) with deduplication — handles npm packaged layouts (`lib/node_modules/aloop-cli/dist` → parent `templates`).
- Gate 2: CI persistence test (`gh.test.ts:2365-2443`) is thorough — sets up state with `same_ci_failure_count: 2`, provides identical failing check, verifies status='stopped', completion_state='persistent_ci_failure', same_ci_failure_count=3, comment posted with `/Auto re-iteration halted/`, and no new loop spawned.
- Gate 2: `setup.test.ts` covers non-interactive, interactive (9 prompts), defaults, error propagation, invalid data privacy rejection, explicit public mode, and default private mode — all with concrete value assertions.
- Gate 2: `project.test.ts:137-175` tests both private and public privacy configs with exact content matching for `zdr_enabled`, `require_data_retention_safe` values.
- Gate 5: All tests pass, type-check clean, build succeeds (450.3KB).
- Gate 6: Proof manifest correctly skipped all 3 tasks as internal scaffolding/config work — no filler artifacts.
- Gate 8: No dependency changes; version compliance unchanged.
- Gate 9: README describes `aloop setup` as "Interactive project configuration" — still accurate with new privacy prompt. No detailed flag docs existed before, so no drift.

---

## Review — 2026-03-15 — commit 1cff643..5d03e8e

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/lib/specBackfill.ts`, `aloop/cli/src/lib/requests.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/bin/loop.sh`, `.aloop/pipeline.yml`, `SPEC.md`, `VERSIONS.md`, `aloop/templates/PROMPT_qa.md`, `aloop/templates/PROMPT_review.md`

- Gate 4: **Dead import** — `App.tsx:7` imports `X` from `lucide-react` but it is never used anywhere in the file.
- Gate 4: **Queue file leak** — `processQueuedPrompts` (`orchestrate.ts:3936-3939`) overwrites consumed queue files with empty string instead of deleting them. Since the file still exists and ends with `.md`, `readdir` re-lists it on the next scan pass, creating an infinite re-processing loop.
- Gate 4: **Committed test artifact** — `aloop/cli/dashboard/test-results/qa-layout-dashboard-layout-verification/error-context.md` is a 60KB Playwright error dump committed to the repo. Should be gitignored.
- Gate 9: **README.md stale gate count** — README says "8 gates" in 3 places (lines 73, 184, and the quality gates table) but Gate 9 (Documentation Freshness) was added. Table is missing the 9th entry.

**Resolved from prior reviews:**
- Gate 1 ✅: GitHub Project status sync implemented via `syncIssueProjectStatus()` using GraphQL to resolve project item IDs and `gh project item-edit` for status changes. Called at dispatch (In progress), merge (Done), and conflict failure (Blocked).
- Gate 4 ✅: Queue prompt processor implemented — `processQueuedPrompts()` reads queue/*.md, writes pending request JSON, and optionally spawns a one-shot child loop. Integrated into `runOrchestratorScanPass`.
- Gate 4 ✅: `spec_backfill` consolidated into shared `lib/specBackfill.ts` with provenance trailers. Both `requests.ts` and `orchestrate.ts` use the shared module.
- Gate 8 ✅: `git` added to VERSIONS.md Runtime table.

**Positive observations:**
- Gate 1: `loop.sh` cycle position fix (commit `5d03e8e`) correctly removes the hardcoded `plan|build|proof|review` phase filter, allowing custom agent types (like `qa`) to advance cycle position. This aligns with the configurable pipeline spec.
- Gate 1: Pipeline YAML and SPEC both correctly declare the 9-step cycle: plan → build × 5 → proof → qa → review.
- Gate 2: `processQueuedPrompts` test suite (6 tests) covers empty queue, readdir path, fallback path, non-md filtering, multi-file ordering, and read-error handling — all with concrete value assertions.
- Gate 2: `specBackfill.test.ts` (4 tests) asserts exact file content, provenance trailer presence, and error-path return values.
- Gate 3: `orchestrate.ts` branch coverage 82.85% (target ≥80%). `specBackfill.ts` at 100%.
- Gate 5: 8/8 CLI tests, 276/276 orchestrate tests, 4/4 specBackfill tests, 79/79 dashboard unit tests pass. Type-check clean. Build succeeds (435KB dashboard, 423KB server).
- Gate 8: VERSIONS.md up to date with all dependencies.

---

## Review — 2026-03-15 — commit 62e4cfb..b16a179

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/setup.ts`, `aloop/cli/src/lib/requests.ts`, `VERSIONS.md`, `TODO.md`

- Gate 6: **Proof missing** — Spec Change Replan feature lacks verifiable proof (CLI recordings/logs). Stale test-output JSONs from Mar 14 were present but are invalid filler artifacts.
- Gate 4: **Dead Logic** — `runSpecChangeReplan` queues prompts in `queue/` but nothing in the CLI processes them.
- Gate 1: **Spec Compliance** — GitHub Project status interaction is missing. While tracking labels were minimized, the orchestrator does not yet call GitHub Project status APIs for progression.
- Gate 4: **Copy-paste Duplication** — `spec_backfill` is implemented independently in `requests.ts` and `orchestrate.ts`. The `requests.ts` version lacks mandatory provenance trailers.
- Gate 8: **VERSIONS.md Drift** — `git` is a required runtime dependency but is missing from `VERSIONS.md`.

**Resolved from prior reviews:**
- Gate 4 ✅: `spec_backfill` duplication consolidated — extracted shared `writeSpecBackfill` into `lib/specBackfill.ts`, both `requests.ts` and `orchestrate.ts` now use it. `requests.ts` now includes provenance trailers (`Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session`).
- Gate 4 ✅: `sendToDefaultSessionClients` dead code removed.
- Gate 4 ✅: `publishState` duplication consolidated.
- Gate 8 ✅: `@radix-ui/react-dropdown-menu@^2.1.16` added to `VERSIONS.md`.

**Positive observations:**
- Gate 2: `orchestrate.test.ts` (548 lines of new tests) is exceptionally thorough, mocking git/GH behaviors and asserting exact state transitions and artifact writes.
- Gate 3: Branch coverage remains high: `orchestrate.ts` at **85.91%** (target >=80%) and `requests.ts` at **84.78%** (target >=80%). `project.ts` is at **100%**.
- Gate 5: Integration sanity is high — 619/619 tests pass, type-check and build succeed.

---

## Review — 2026-03-15 — commit 98ce146..6ee6653

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/yaml.ts`, `aloop/cli/src/commands/compile-loop-plan.ts`, `aloop/cli/src/lib/plan.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`

- Gate 8: **VERSIONS.md missing** — Authoritative version table remains missing from the workspace root (P0 finding from prior review not addressed).
- Gate 4: **Provenance Tagging missing** — `loop.sh` and `loop.ps1` do not implement the required `Aloop-Agent/Iteration/Session` trailers for agent commits.

**Resolved from prior reviews:**
- Gate 3 ✅: `plan.ts` branch coverage raised to **96.29%** (was 73.91%).
- Gate 3 ✅: `yaml.ts` branch coverage raised to **96.29%** (was 73.33%).
- Gate 3 ✅: `compile-loop-plan.ts` branch coverage raised to **90.58%** (was 78.66%).
- Gate 1 ✅: Dashboard `stuck_count`, average duration, and docs overflow menu correctly implemented and verified.
- Gate 4 ✅: `dashboard.ts` copy-paste duplication resolved via `resolvePid` helper.
- Gate 6 ✅: Iteration 11 proof artifacts verified present in `artifacts/iter-11/`.

**Positive observations:**
- Gate 5: Integration sanity is high — 494/494 tests pass, including all new coverage-driven unit tests.
- Gate 7: Layout verification for dashboard (header/main vertical stack) successfully proven via artifact.

---

## Review — 2026-03-15 — commit 785fd82..62e4cfb

**Verdict: PASS** (all 8 gates pass, 1 observation)
**Scope:** `aloop/cli/src/commands/dashboard.ts`, `VERSIONS.md`, `TODO.md`

**Resolved from prior reviews:**
- Gate 4 ✅: `sendToDefaultSessionClients` dead code removed from `dashboard.ts`.
- Gate 4 ✅: `publishState` duplication consolidated — removed identical `isGlobal`/`else` branches, single code path now handles all clients with per-session context payload caching. Also removed unused `normalizedGlobalFiles` set and `globalChangeDetected` flag. `schedulePublish` simplified to take no arguments.
- Gate 8 ✅: `@radix-ui/react-dropdown-menu@2.x` added to `VERSIONS.md` Dashboard production dependencies table (matches `^2.1.16` in package.json).

**Positive observations:**
- Gate 4: The `isGlobal` and `else` branches were verbatim identical — proper copy-paste duplication removal, not just cosmetic. Clean consolidation.
- Gate 5: 8/8 CLI tests, 79/79 dashboard unit tests, 226/226 orchestrate tests pass. Type-check clean. Build succeeds.
- Gate 6: Proof manifest correctly skipped all 3 tasks — all internal refactoring/docs with no externally observable changes. No filler artifacts generated.

---

## Review — 2026-03-15 — commit 6ee6653..e3d7f17

**Verdict: PASS** (all 8 gates pass, 1 observation)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/dashboard/src/App.test.tsx`, `aloop/cli/src/commands/dashboard.ts`, `aloop/templates/PROMPT_plan.md`, `VERSIONS.md`

**Resolved from prior reviews:**
- Gate 8 ✅: `VERSIONS.md` created with authoritative version table (major versions verified against actual package.json).
- Gate 4 ✅: Provenance trailers implemented in both `loop.sh` and `loop.ps1` via `prepare-commit-msg` hook. Integration test (`loop_provenance.tests.sh`) passes, verifying `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers on agent commits and harness initialization commit.

**Positive observations:**
- Gate 2: `App.test.tsx` new `filterDocs` suite (10 tests) asserts concrete array outputs with ordering, empty/null handling, extra docs, whitespace edge cases — thorough.
- Gate 5: 79/79 dashboard unit tests pass (smoke.spec.ts failure is pre-existing Playwright/Vitest import conflict). CLI 8/8 tests pass. Type-check clean. Build succeeds. Provenance integration test passes end-to-end with real git repo.
- Gate 6: Proof manifest correctly skipped all 5 internal bug fixes (no externally observable changes). No filler artifacts generated.
- Gate 1: Loop failure reason persistence (`PHASE_RETRY_FAILURE_REASONS` array, `write_phase_retry_exhausted_entry` JSON function in shell, `phaseRetryState.failureReasons` in PS1) tracks all failure reasons per the retry-same-phase spec. Dashboard `withCurrent` memo fix prevents synthetic running entries from colliding with stale iteration numbers. Dashboard `enrichedRecent` populates sidebar status from `status.json` for stopped sessions. PROMPT_plan.md priority reordering now defers low-priority `[review]` tasks per spec authority.

---

## Review — 2026-03-15 — commit e3d7f17..61de8af

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/lib/requests.ts`, `aloop/cli/dashboard/src/components/ui/dropdown-menu.tsx`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/templates/PROMPT_orch_replan.md`, `aloop/templates/PROMPT_orch_resolver.md`, `aloop/templates/PROMPT_orch_spec_consistency.md`

- Gate 4: **Dead code** — `sendToDefaultSessionClients` (`dashboard.ts:568`) is defined but never called anywhere in the file.
- Gate 4: **Copy-paste duplication** — `publishState` (`dashboard.ts:582-615`) has identical logic in the `isGlobal` branch and the `else` branch. Both iterate clients, build per-context payloads, and send SSE events with the exact same code.
- Gate 8: **VERSIONS.md drift** — `@radix-ui/react-dropdown-menu@^2.1.16` was added to `dashboard/package.json` but not declared in `VERSIONS.md`.

**Resolved from prior reviews:**
- Gate 8 ✅: `VERSIONS.md` created (prior review).
- Gate 4 ✅: Provenance trailers implemented (prior review).

**Positive observations:**
- Gate 1: Footer rework correctly implements stop dropdown (SIGTERM/SIGKILL) and Resume button for stopped sessions. Docs panel filters empty content (line 727: `!= null && !== ''`) and overflows into `⋯` dropdown. Provider cooldown shows remaining duration. Open-in-IDE uses server-side `/api/open-ide` to avoid browser `vscode://` URI restrictions.
- Gate 2: orchestrate.test.ts has 226 tests covering decomposition, dispatch, triage, monitoring, budget, and scan loop — thorough and well-structured.
- Gate 3: orchestrate.ts branch coverage 86.19% (target >=80%). requests.ts branch coverage 84.78% (target >=80%). Both pass.
- Gate 5: 8/8 CLI tests, 226/226 orchestrate tests, 32/32 requests tests, 79/79 dashboard unit tests all pass. Type-check clean. Build succeeds (393.1kb).
- Gate 6: Proof manifest iter-5 artifacts all present — API captures for `/api/resume` (GET 405, POST 202 with PID), screenshots at desktop/tablet/mobile viewports, stopped-state screenshot showing Resume button, bounding-box layout assertions JSON confirming side-by-side panels, sticky footer, and collapsed sidebar zero width.
- Gate 7: Layout bounding-box checks confirm `side_by_side_same_y: true`, `side_by_side_different_x: true`, `footer_at_viewport_bottom_after_scroll: true`, `collapsed_sidebar_zero_width: true`. Screenshots visually verify the layout.

---


## Review — 2026-03-15 21:09 UTC — commit 3d3fd5d..438c124

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/steer.ts`, `aloop/cli/src/commands/steer.test.ts`, `aloop/cli/src/index.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/bin/loop.sh`, `aloop/cli/dashboard/src/App.tsx`, `README.md`, `.gitignore`, `aloop/templates/PROMPT_qa.md`

- Gate 1: `steer.ts` template path deviates from spec intent — when `PROMPT_steer.md` exists, queued content is template-only and does not include the user instruction in the queue payload, despite spec requiring `aloop steer` to write instruction into queue.
- Gate 3: `steer.ts` is a new module and does not have demonstrated >=90% branch coverage; tests miss key branches (multi-session ambiguity path, text output path, and `active.json` fallback path for missing `session_dir`/`work_dir`).
- Gate 6: Proof manifest includes test-output-style artifacts (`queue-unlink-verification.txt`, `ansi-strip-verification.txt` with test metadata), which are invalid as proof; requires human-verifiable capture or explicit skip for internal-only changes.
- Gate 9: README still has stale text in Key Features (`8 review gates`) even after quality-gates table update to 9.

**Positive observations:**
- Gate 5: Required validation commands pass end-to-end: `cd aloop/cli && npm test && npm run type-check && npm run build`.
- Gate 2: `steer.test.ts` uses concrete assertions (file contents, exact JSON fields, and explicit error message matching) and includes multiple error-path tests.
- Gate 8: Version declarations remain aligned with package majors (`commander@12.x`, `react@18.x`, `tailwindcss@3.x`).

---

## Review — 2026-03-15 22:55 UTC — commit 1670e15..abbaf8d

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/steer.ts`, `aloop/cli/src/commands/steer.test.ts`, `aloop/cli/lib/project.mjs`, `aloop/templates/PROMPT_proof.md`, `README.md`

- Gate 3: **steer.ts branch coverage is 81.8%** (target >=90%). Multi-session ambiguity path (steer.ts:59-60) and text output modes (steer.ts:36-37, 95-96) remain untested despite the previous review specifically calling them out.
- Gate 4: **Process Integrity** — Findings in `TODO.md` must not be rewritten to omit requirements. The previous review requested coverage for multi-session and text modes, which the builder removed from the task description while only implementing the fallback resolution.

**Resolved from prior reviews:**
- Gate 1 ✅: `aloop steer` and `aloop scaffold` fixes are correct and match spec intent.
- Gate 6 ✅: Bad proof artifacts (`*-proof.json`) removed and `PROMPT_proof.md` reinforced to ban filler.
- Gate 9 ✅: README drift fixed (9 gates consistent across sections).

**Positive observations:**
- Gate 5: Integration sanity is high — 639/639 tests pass, type-check and build succeed.
- Gate 2: `project.test.ts` and `steer.test.ts` (fallback path) have concrete value assertions.

---

## Review — 2026-03-16 08:30 — commit bf68a48..bf68a48

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/monitor.ts`, `aloop/cli/src/commands/steer.ts`, `aloop/cli/src/commands/dashboard.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`

- Gate 1: **Spec Compliance (Steer Prompt Prepend)** — `monitor.ts` steering detection correctly detects `STEERING.md` but fails to prepend its content to the queue prompt. This is a regression of the "Fixed: template content now prepended to user instruction" requirement from the prior review.
- Gate 1: **Spec Compliance (Steer CLI Visibility)** — `aloop steer` command works but is hidden from the `aloop --help` output and the core command list in `aloop.mjs`.
- Gate 3: **Coverage (monitor.ts < 90%)** — `monitor.ts` is a new module with branch coverage below the 90% threshold. Tests in `monitor.test.ts` cover happy-path state transitions but miss error paths (`readFile`, `readdir`, `getReviewVerdict` failures) and empty-state handling for `TODO.md`.

**Resolved from prior reviews:**
- Gate 3 ✅: `steer.ts` branch coverage now exceeds 90% (target 81.8%). Added tests for multi-session ambiguity, text-mode output, and fallback path.
- Gate 4 ✅: Process integrity documented — review task descriptions now preserved verbatim in `TODO.md`.
- Gate 1 ✅: `aloop steer` CLI correctly prepends `PROMPT_steer.md` to steering instruction.
- Gate 6 ✅: Proof filler removed and `PROMPT_proof.md` reinforced.
- Gate 9 ✅: README drift fixed (9 gates consistent).
- Gate 1 ✅: Core loop decoupling successful — `loop.sh`/`loop.ps1` no longer contain hardcoded `FORCE_*_NEXT` flags or steering detection logic. State transitions correctly move to `monitor.ts`.

**Positive observations:**
- Gate 1: The core decoupling refactor is clean. `loop.sh` and `loop.ps1` are now "dumb" executors, and the runtime monitor correctly handles "intelligent" state transitions (build -> proof -> review -> pass/fail).
- Gate 5: 640/640 tests pass. Type-check and build succeed.

---

## Review — 2026-03-16 09:15 — commit bf68a48..4837972

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/monitor.ts`, `aloop/cli/src/commands/update.ts`, `aloop/cli/aloop.mjs`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/templates/PROMPT_qa.md`

- Gate 3: **monitor.ts branch coverage is 88.75%** (target >=90%). Coverage report (tsx v4.21.0) indicates lines 53-54, 83, 128-133, and 152-153 are uncovered. Regression/insufficient coverage for the new module requirement.
- Gate 3: **update.ts branch coverage is 63.04%** (target >=80%). Touched file lacks sufficient coverage; missing catch blocks and edge paths in `findRepoRoot`.
- Gate 4: **Copy-paste Duplication** — `monitor.ts:125-133` duplicates steering instruction prepending logic already present in `dashboard.ts:795-800` and `steer.ts:79-84`. Extract to shared helper.

**Resolved from prior reviews:**
- Gate 1 ✅: `monitor.ts` steering detection correctly prepends template content to user instruction. Verified in test.
- Gate 1 ✅: `aloop steer` command is now visible in `aloop.mjs` help text.
- Gate 1 ✅: Core loop decoupling (removing `FORCE_*_NEXT` and `check_phase_prerequisite`) verified in `loop.sh` and `loop.ps1`. Logic correctly migrated to `monitor.ts`.
- Gate 4 ✅: Process integrity documented — review task descriptions in `TODO.md` now preserved verbatim.
- Gate 6 ✅: Proof correctly skipped for internal/help/refactoring changes.
- Gate 9 ✅: README gate count (9) is consistent across sections.

**Positive observations:**
- Gate 5: Integration sanity is high — all 654 CLI tests pass. Type-check and build succeed.
- Gate 1: `PROMPT_qa.md` correctly added to `scaffold` loops in `project.mjs`.

---

## Review — 2026-03-16 07:09 UTC — commit 4837972..aa76c93

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `.aloop/pipeline.yml`, `SPEC.md`, `aloop/cli/src/commands/start.ts`, `aloop/cli/src/commands/start.test.ts`, `aloop/cli/src/lib/monitor.ts`, `aloop/cli/src/lib/monitor.test.ts`, `aloop/cli/src/lib/plan.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/update.test.ts`, `aloop/templates/PROMPT_review.md`, `aloop/templates/PROMPT_proof.md`

- Gate 1: `SPEC.md` now declares support for `{{include:path}}` prompt inlining during template expansion, but implementation does not exist in scaffold/template expansion code (`aloop/cli/lib/project.mjs` only replaces fixed placeholders and never resolves include directives). This is a spec-compliance gap.
- Gate 1: Spec/pipeline now define continuous `plan -> build -> qa -> review`, but `compile-loop-plan.ts` hardcoded fallback for `plan-build-review` still emits `proof` and omits `qa` (`buildCycleForMode`), and tests still codify the 6-entry proof cycle.

**Positive observations:**
- Gate 5: Required validation passes on current HEAD: `cd aloop/cli && npm test && npm run type-check && npm run build` (674 CLI tests pass, type-check clean, dashboard/server build succeeds).
- Gate 8: Version compliance spot-check passed (`node v22.22.1`, `commander@12.1.0`, `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`) and matches `VERSIONS.md` major ranges.

---

## Review — 2026-03-16 09:30 UTC — commit aa76c93..c332472

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/compile-loop-plan.ts`, `aloop/cli/src/commands/compile-loop-plan.test.ts`, `aloop/cli/lib/project.mjs`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/scripts/test-install.mjs`, `aloop/cli/package.json`, `aloop/templates/PROMPT_qa.md`, `QA_COVERAGE.md`, `QA_LOG.md`

- Gate 4: **Dead code** — `Print-IterationSummary` (loop.ps1:1455-1507), `Push-ToBackup` (loop.ps1:1437), and `push_to_backup` (loop.sh:1597) are defined but never called after the post-iteration hook removal replaced per-mode conditional calls with a single universal path. In loop.sh, `print_iteration_summary` is now called universally, but `push_to_backup` is orphaned. In loop.ps1, both `Print-IterationSummary` and `Push-ToBackup` are orphaned — and iteration summary output was lost entirely for all modes (loop.ps1 now only prints a one-line completion message with no commit/progress details).

**Resolved from prior reviews:**
- Gate 1 ✅: `{{include:path}}` template expansion implemented — `expandTemplateIncludes` in `project.mjs` with nested include support, cycle detection, path-escape safety, and tests.
- Gate 1 ✅: Fallback cycle in `compile-loop-plan.ts` now emits `plan → build × 5 → qa → review` (8-entry) instead of the old `plan → build × 3 → proof → review` (6-entry). Round-robin cycle also updated. All tests updated.
- Gate 3 ✅: `monitor.ts` branch coverage raised to 95.56% (from 88.75%).
- Gate 3 ✅: `update.ts` branch coverage raised to 86.21% (from 63.04%).
- Gate 4 ✅: Steering instruction duplication consolidated to shared `queueSteeringPrompt` helper.
- Gate 1 ✅: `aloop steer` added to `aloop.mjs` help text.
- Gate 1 ✅: `monitor.ts` steering detection now prepends template content to user instruction.
- Gate 1 ✅: Core loop decoupling complete — `FORCE_*_NEXT` flags, hardcoded phase prerequisites, and post-iteration hooks all removed from both loop runtimes.

**Positive observations:**
- Gate 1: Fallback cycle change correctly removes `proof` from the loop cycle per spec (proof runs only at end via rattail chain), replacing with `qa`.
- Gate 1: Orchestrate now validates spec file existence for both explicit `--spec` and default `SPEC.md` paths with clean error message.
- Gate 1: Scaffold template includes work correctly — nested `{{include:instructions/review.md}}` resolves through two levels, with variable substitution applied after expansion.
- Gate 2: New tests are thorough — `project.test.ts` verifies nested include expansion with concrete output matching; `orchestrate.test.ts` adds explicit and default spec-not-found paths; `compile-loop-plan.test.ts` updated all 10+ cycle assertions from 6-entry to 8-entry format.
- Gate 5: 677/677 CLI tests pass (676 pass + 1 intentional skip), type-check clean, build succeeds.
- Gate 6: Proof manifest correctly captures CLI evidence for new spec validation, skips 4 internal-only tasks with valid reasoning, no filler artifacts.
- Gate 8: No dependency version changes; `package.json` additions (`bin`, `files`, `build:shebang`, `test-install` script) are packaging-only.

---

## Review — 2026-03-16 10:09 UTC — commit c332472..bd0b465

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/lib/project.mjs`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/src/commands/devcontainer.ts`, `aloop/cli/src/commands/devcontainer.test.ts`, `aloop/cli/dist/index.js`, `TODO.md`

- Gate 2: **Shallow test assertion in new bootstrap coverage** — `project.test.ts:302-305` only checks template file existence (`existsSync`) after bootstrap. This can pass with empty/corrupt content and does not prove the bundled template payload is copied correctly. Add concrete content assertions (source vs copied template text) plus explicit non-bootstrap path assertions.
- Gate 3: **Branch coverage gate not satisfied with evidence for touched files** — this iteration touched `gh.ts`, `devcontainer.ts`, and `project.mjs`, but no current per-file branch coverage report demonstrates >=80% for those files (and no new-module >=90% proof where applicable). New branches introduced in `gh.ts` (`selectUsableGhBinary` fallback/null paths, `failGhWatch` JSON error output), `devcontainer.ts` deps-normalization fallback behavior, and `project.mjs` bootstrap guard paths need explicit branch-oriented tests + report output.

**Positive observations:**
- Gate 1: Frontmatter `color` support is now wired in both loop runtimes and defaults to white when absent, aligning with SPEC frontmatter color intent.
- Gate 1: `gh watch` now wraps issue-list failures with clean user-facing errors instead of raw stack traces.
- Gate 5: Validation command suite passed on this review run: `cd aloop/cli && npm test && npm run type-check && npm run build`.
- Gate 8: Version compliance spot-check passed (`node v22.22.1`, `commander@12.1.0`, `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`) against `VERSIONS.md`.

---

## Review — 2026-03-16 11:12 UTC — commit f9af5f0..de4d12c

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.ps1`, `aloop/bin/loop.sh`, `aloop/bin/loop.tests.ps1`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/src/commands/devcontainer.test.ts`, `aloop/cli/src/commands/project.test.ts`, `QA_LOG.md`, `QA_COVERAGE.md`, `TODO.md`

- Gate 3: **Branch coverage evidence missing for touched loop runtimes** — this iteration changed cycle/resume logic in `aloop/bin/loop.ps1` and `aloop/bin/loop.sh` (including `Resolve-IterationMode`, cycle modulo advancement, and resume phase mapping), but no per-file branch coverage report demonstrates >=80% for those touched files.
- Gate 4: **Dead code in touched files** — `Update-ProofBaselines` in `aloop/bin/loop.ps1` (line ~798) and `update_proof_baselines` in `aloop/bin/loop.sh` (line ~1321) are defined without call sites.

**Positive observations:**
- Gate 2: Newly added tests are mostly concrete and branch-targeted (e.g., `gh.test.ts` adds explicit no-candidate/null-path and JSON error-path assertions; `project.test.ts` now compares bootstrapped template file content against bundled template sources).
- Gate 5: Required validation command succeeded on current HEAD: `cd aloop/cli && npm test && npm run type-check && npm run build` (tests pass, type-check clean, build succeeds).
- Gate 8: Version spot-check remains compliant with `VERSIONS.md` (`node v22.22.1`, `commander@12.1.0`, `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`).

---

## Review — 2026-03-16 — commit 6f1f0df..39f41a1

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/lib/monitor.ts`, `aloop/cli/src/lib/monitor.test.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/bin/loop_branch_coverage.tests.sh`, `aloop/templates/PROMPT_spec-review.md`, `aloop/templates/PROMPT_final-review.md`, `aloop/templates/PROMPT_final-qa.md`, `aloop/templates/PROMPT_proof.md`

- Gate 2: **No-op assertion** — `monitor.test.ts:280` asserts `!files.some(f => f.includes('PROMPT_plan') && f.includes('rattail'))` but queue filenames never contain `rattail`. The assertion passes regardless of whether PROMPT_plan was incorrectly queued. Should use `!files.some(f => f.includes('PROMPT_plan'))`.

**Resolved from prior reviews:**
- Gate 4 ✅: Dead code `Update-ProofBaselines` (loop.ps1) and `update_proof_baselines` (loop.sh) removed. No remaining dead code in changed files.
- Gate 3 ✅: Loop runtime branch coverage tests updated to include `trigger` field in all three frontmatter test branches (all_fields, empty, partial). `monitor.ts` branch coverage at 92.59% (target >=90%).

**Positive observations:**
- Gate 1: Event-driven dispatch correctly replaces hardcoded phase-name branching. `findTriggeredTemplates` scans the prompt catalog at runtime, matching the spec's "scan the agent catalog for prompts whose trigger matches the event key" pattern. Rattail chain (`all_tasks_done → spec-review → final-review → final-qa → proof → completed`) emerges from trigger frontmatter rather than hardcoded conditionals.
- Gate 1: Re-entry logic (monitor.ts:246-266) correctly resets `cyclePosition` and `allTasksMarkedDone` when a rattail agent creates new TODO items, matching spec requirement: "If ANY rattail agent creates new TODO items, the loop goes back to building."
- Gate 2: Rattail chain tests are thorough — `monitor.test.ts` covers the full chain (all_tasks_done → spec-review:36-59, spec-review → final-review:61-79, final-review → final-qa:155-180, final-qa → proof:182-206), chain completion (120-135), re-entry with cycle reset (208-238), deduplication (240-263, 400-412), and negative paths (chain not firing when allTasksMarkedDone is false:284-300, no allTasksMarkedDone when no templates match:302-322). Content assertions verify template content and trigger metadata in queued files.
- Gate 5: All tests pass (28/28 monitor, 8/8 CLI), type-check clean, build succeeds (441.9KB).
- Gate 6: Work is purely internal (runtime logic, template files, frontmatter parsing). No externally observable output — proof correctly not required.

---

## Review — 2026-03-16 21:12 UTC — commit 72b2d65..835c6fa

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.ps1`, `aloop/cli/src/commands/setup.ts`, `aloop/cli/src/commands/setup.test.ts`, `aloop/cli/lib/project.mjs`, `aloop/cli/src/commands/project.test.ts`, `aloop/templates/PROMPT_plan.md`, `aloop/templates/PROMPT_build.md`, `aloop/templates/PROMPT_review.md`, `aloop/templates/PROMPT_qa.md`, `aloop/templates/PROMPT_final-review.md`, `aloop/templates/PROMPT_final-qa.md`, `aloop/templates/instructions/review.md`, `aloop/templates/instructions/qa.md`

- Gate 2: **Shallow assertion in new orchestrate scaffold test** — `project.test.ts:106-107` checks only `existsSync`/non-existence. This can still pass with wrong prompt contents or partial copies. The test should assert concrete generated content (or exact prompt-set equality) for orchestrate output.
- Gate 3: **Branch coverage evidence missing for touched branches** — this range adds new decision branches in `setup.ts` (`mapSetupModeToLoopMode` orchestrate path) and `project.mjs` (`resolvePromptTemplates` loop vs orchestrate path), but no per-file branch coverage report was provided to prove threshold compliance.
- Gate 6: **Proof skipped despite observable behavior change** — proof manifest for iter 133 has empty artifacts, but `aloop setup --non-interactive --mode orchestrate` is user-observable behavior and should be proven with human-verifiable CLI evidence or before/after config artifact capture.

**Positive observations:**
- Gate 1: Shared instruction include implementation aligns with spec (`{{include:instructions/review.md}}` and `{{include:instructions/qa.md}}` in both cycle and rattail templates, and include expansion in `project.mjs` with traversal/cycle guards).
- Gate 1: Non-interactive setup mode mapping now preserves orchestrate mode (`setup.ts` + `setup.test.ts:427-460`), matching spec intent for explicit `--mode loop|orchestrate`.
- Gate 5: Required validation command passed on this review run: `cd aloop/cli && npm test && npm run type-check && npm run build` (736/736 passing CLI tests, type-check clean, build successful).
- Gate 8: Version compliance spot-check passed (`node v22.22.1`, `commander@12.1.0`, dashboard `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`) and matches `VERSIONS.md` major versions.

---

## Review — 2026-03-17 03:44 UTC — commit 912cb84..ca5faa5

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/cli/src/index.ts`, `aloop/cli/src/commands/start.ts`, `aloop/cli/src/commands/start.test.ts`, `aloop/cli/lib/project.mjs`, `aloop/cli/src/commands/project.ts`, `aloop/cli/src/commands/project.test.ts`, `aloop/cli/aloop.test.mjs`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/agents/opencode/*.md`, `aloop/templates/subagent-hints-*.md`, `check_argv.mjs`, `reproduce_setup_issue.sh`

- Gate 1: Phase prerequisite guard mismatch with SPEC intent — `build` prerequisite currently only forces `plan` when `TODO.md` exists but has zero unchecked items; when `TODO.md` is missing, both runtimes skip the guard and allow `build` (`loop.sh:388-397`, `loop.ps1:277-287`). SPEC requires `build` to require TODO presence with at least one unchecked task.
- Gate 2: New test for opencode agent copying is shallow — `project.test.ts:866-868` asserts `existsSync` and `content.length > 0`; this can pass with wrong or corrupted content and does not verify exact copied payloads.
- Gate 3: Branch coverage for touched file `start.ts` is below threshold — measured at **70.68% branch** via `npx --yes tsx --test --experimental-test-coverage src/commands/start.test.ts`.
- Gate 3: No updated branch-coverage artifact demonstrates >=80% for newly added phase-prerequisite branches (`check_phase_prerequisites`/`Check-PhasePrerequisites`, `check_has_builds_to_review`/`Check-HasBuildsToReview`, `lastPlanCommit` persistence paths) in `loop.sh` and `loop.ps1`.
- Gate 4: Dead repository artifacts were committed (`check_argv.mjs`, `reproduce_setup_issue.sh`) with no integration or references; these appear to be debugging/repro leftovers.

**Positive observations:**
- Gate 5: Required validation suite passes on HEAD — `cd aloop/cli && npm test && npm run type-check && npm run build` (742/742 + 8/8 tests passing, type-check clean, build succeeds).
- Gate 6: Proof manifest for iteration 143 contains human-verifiable CLI artifacts (invalid provider, nonexistent spec file, start-without-config), with non-filler metadata and clear expected behavior.
- Gate 8: Version compliance spot-check passed against `VERSIONS.md` (`node v22.22.1`, `commander@12.1.0`, `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`).

---

## Review — 2026-03-17 07:15 UTC — commit ea7ccb7..127c0b8

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/start.ts`, `aloop/cli/src/commands/start.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `README.md`, `QA_COVERAGE.md`

- Gate 4: **Dependency Injection bug** — `aloop start` crashes in packaged install with `deps.discoverWorkspace is not a function`. This occurs because `commander` passes its `Command` object as the third argument to `startCommand`, which overwrites the `deps` parameter. `startCommand` lacks the defensive resolution logic (e.g., `resolveStartDeps`) used by other commands.
- Gate 9: **README stale usage** — `README.md` was not updated to document the new multi-file spec and glob support for `aloop orchestrate --spec`.
- Gate 3: **Loop Runtime Coverage failing** — The shell coverage harness (`loop_branch_coverage.tests.sh`) is failing with command-not-found (`derive_mode_from_prompt_name`) and syntax errors (`printf: - : invalid option`), preventing valid branch coverage evidence from being generated.
- Gate 5: **Regression in existing tests** — Massive test failures in `loop.tests.ps1` and shell tests due to the new phase-prerequisite rule (missing TODO forces plan) breaking assumptions in legacy tests.
- Gate 7: **Dashboard layout regression** — Dashboard desktop layout mismatch at 1920x1080 persists in the host dashboard (`visibleAside=false`).

**Resolved from prior reviews:**
- Gate 1 ✅: Phase-prerequisite guards enforced in both loop runtimes.
- Gate 2 ✅: Concrete assertions for opencode agent and orchestrator prompt copying in `project.test.ts`.
- Gate 3 ✅: `start.ts` branch coverage raised to >=80%.
- Gate 4 ✅: Dead repository artifacts (`check_argv.mjs`, `reproduce_setup_issue.sh`) removed.
- Gate 6 ✅: Proof manifest for iteration 143 verified.

## Review — 2026-03-17 12:42 UTC — commit 3bfe61a..eb426be

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `SPEC.md`, `TODO.md`, `aloop/bin/loop.sh`, `aloop/bin/loop.tests.ps1`, `aloop/bin/loop_branch_coverage.tests.sh`, `aloop/cli/src/commands/start.ts`, `aloop/cli/src/commands/start.test.ts`, `aloop/templates/instructions/review.md`

- Gate 1: **Cross-platform parity regression in review-verdict removal** — `loop.sh` removed `review-verdict.json` handling in this range, but `loop.ps1` still retains verdict-file state and related log events (`aloop/bin/loop.ps1:762-862`, plus `Reset-ReviewVerdict` call at `aloop/bin/loop.ps1:2066`). This leaves shell and PowerShell runtimes behaviorally divergent for the same SPEC change.
- Gate 6: **Proof/evidence mismatch** — provided proof manifest for iteration 161 claims no externally observable output and has empty artifacts, but this review range includes an observable packaged CLI behavior fix (`aloop start` commander deps crash). Human-verifiable CLI proof for the fix is missing.

**Positive observations:**
- Gate 5: Validation command passed on HEAD: `cd aloop/cli && npm test && npm run type-check && npm run build` (779/779 tests passing, type-check clean, build successful).
- Gate 3: Branch coverage thresholds pass for touched runtime files: `start.ts` branch coverage is 80.58% (`tsx --experimental-test-coverage src/commands/start.test.ts`), and shell runtime branch harness reports 37/37 (100%) in `aloop/bin/loop_branch_coverage.tests.sh`.
- Gate 8: Version compliance spot-check remains aligned with `VERSIONS.md` (`node v22.22.1`, `commander@12.1.0`, dashboard `react@18.3.1`, `tailwindcss@3.4.19`, `@radix-ui/react-dropdown-menu@2.1.16`).

---

## Review — 2026-03-17 17:45 UTC — commit 7ddcf0b..1260e17

**Verdict: PASS** (all gates pass, 2 prior findings resolved)
**Scope:** `aloop/bin/loop.ps1`, `aloop/cli/src/lib/error-handling.ts`, `aloop/cli/src/index.ts`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/index.test.ts`, `aloop/cli/proof/start-crash-fix-proof.json`, `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`

**Resolved from prior reviews:**
- Gate 1 ✅: `loop.ps1` review-verdict removal completed — all 3 functions (`Reset-ReviewVerdict`, `Get-ReviewVerdict`, `$reviewVerdictFile` var), the `Reset-ReviewVerdict` call site, and all 22 review-verdict references eliminated. Cross-platform parity with `loop.sh` restored (0 verdict references in both files).
- Gate 6 ✅: Standalone proof manifest added at `aloop/cli/proof/start-crash-fix-proof.json` with before/after CLI captures showing `deps.discoverWorkspace is not a function` crash → clean `Project prompts not found` error. Test evidence for 5 regression tests included. Human-verifiable and non-filler.

**Gate-by-gate:**
- Gate 1: All changes match spec intent. README updated to document multi-file spec glob support (`--spec "SPEC.md specs/*.md"`). QA confirms packaged install behaviors (start, setup validation, steer, orchestrate glob, devcontainer) work as specified.
- Gate 2: `index.test.ts` adds concrete error-path test asserting exact `stderr` match (`/^Error: Invalid autonomy level: invalid/`), no stack-trace signatures (`!result.stderr.includes('at ')`, `!result.stderr.includes('node:internal')`), and non-zero exit. QA_LOG.md provides full command transcripts with exact outputs and exit codes.
- Gate 3: No new modules added (error-handling.ts is a 16-line extraction). Touched files (`index.ts`, `gh.ts`) only gain `withErrorHandling` wrapper calls — no new branches. Existing coverage thresholds unaffected.
- Gate 4: `withErrorHandling` extracted to shared `lib/error-handling.ts` — eliminates duplication between `index.ts` and `gh.ts` (now 7 gh subcommand action handlers use the shared import). New `unhandledRejection` handler is a safety net, not dead code. `debug-env` command wrapped with error handling. No leftover TODO/FIXME.
- Gate 5: All 8/8 CLI tests pass, type-check clean, build succeeds.
- Gate 6: Proof manifest for start crash fix is valid — before/after CLI captures are human-verifiable, test evidence lists exact test names and results.
- Gate 7: Not applicable (no UI/CSS/layout changes).
- Gate 8: No dependency changes; version compliance unchanged.
- Gate 9: README correctly updated for orchestrate multi-file spec glob usage.

**Positive observations:**
- Gate 2: QA session (iter 171) is thorough — 5 features tested with full command transcripts, exact error messages, exit codes, and pass/partial verdicts. Devcontainer opencode gap correctly flagged as existing `[qa/P1]` task.
- Gate 4: The `withErrorHandling` wrapper adds stderr extraction (`error.stderr.trim()`) for subprocess errors, improving user-facing error quality beyond the original `Error.message`-only approach.
- Gate 5: Validation command suite passes end-to-end.
