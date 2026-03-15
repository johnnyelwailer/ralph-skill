# Review Log

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
- Gate 5: 8/8 CLI tests, 79/79 dashboard unit tests, 226/226 orchestrator tests pass. Type-check clean. Build succeeds.
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


