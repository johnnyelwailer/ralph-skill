# Review Log

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
