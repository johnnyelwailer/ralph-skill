# Review Log

## Review — 2026-03-15 — commit 98ce146..28811ec

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `.aloop/pipeline.yml`, `.aloop/agents/*.yml`, `aloop/cli/src/commands/compile-loop-plan.ts`, `aloop/cli/src/lib/yaml.ts`, `aloop/templates/PROMPT_orch_*.md`

- Gate 6: **Missing Proof Artifacts** — All 4 artifacts listed in the proof manifest iteration 36 (`compile-loop-plan-tests.txt`, `yaml-parser-tests.txt`, `orchestrator-prompts-listing.txt`, and `pipeline-config-validation.txt`) are missing from the workspace. Claimed evidence is not verifiable.
- Gate 3: `yaml.ts` branch coverage is **73.33%** (FAIL, new module threshold is >=90%). Uncovered branches: `stripInlineComment` (lines 17-20), `null` scalar parsing (line 36), and nested top-level object property logic (line 94).
- Gate 3: `compile-loop-plan.ts` branch coverage is **78.66%** (FAIL, touched module threshold is >=80%). Uncovered branches: `buildCycleFromPipeline` catch block (lines 125-127) and `buildRoundRobinCycle` ternary fallback (lines 169-170).
- Gate 2: `yaml.test.ts` lacks depth — misses tests for `null` scalar, inline comments, and multi-level nested property resolution.
- Gate 8: **VERSIONS.md missing** — Authoritative version table is missing from the workspace, making version compliance verification impossible.

**Positive observations:**
- Gate 1: Configurable pipeline successfully implemented — `compile-loop-plan.ts` correctly reads and applies `.aloop/pipeline.yml` and `.aloop/agents/*.yml` to generate `loop-plan.json`.
- Gate 5: Validation is green — `tsc --noEmit`, `npm test`, and `npm run build` all pass in `aloop/cli`.
- Gate 4: Modern orchestrator prompt templates (11 files) have been added with the expected `M/A/D/R` and vertical-slice terminology.

---

## Review — 2026-03-15 10:15 — commit 0ad23eb..8a5baa1

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/bin/loop.tests.ps1`, `aloop/cli/src/lib/requests.ts`, `aloop/cli/src/lib/requests.test.ts`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/dashboard/src/App.tsx`

- Gate 5: `tsc --noEmit` fails with TS2300 — duplicate `import path from 'node:path'` at `orchestrate.test.ts:3` and `orchestrate.test.ts:2408`. Build is red.
- Gate 3: `requests.ts` branch coverage is 55.93% (<80% threshold) — up from 52.5% but still far below gate. Uncovered branches at lines 220-229, 266, 385-386, 413-427, 453-454, 505-506.
- Gate 3: `plan.ts` branch coverage is 35.71% (<80% threshold) — down from 40% in prior review. No new tests added this iteration.
- Gate 4: Copy-paste duplication in `dashboard.ts:247-264` — the active.json PID fallback block is duplicated verbatim in the `if` and `else if` branches of PID resolution.

**Resolved from prior review (2026-03-15 — 1117ee1..2aedc45):**
- Gate 5 ✅: `requests.ts:307` `request.payload.title` TS error — removed dead code branch (commit 889ede1).
- Gate 5 ✅: 6 dashboard test failures from `responses/` → `queue/` path mismatch — all tests updated (commit 97061ef).
- Gate 5 ✅: 3 `orchestrate.test.ts` EACCES failures from hardcoded `/home/user` — tests now use `os.tmpdir()` (commit 97061ef).
- Gate 2 ✅: Missing 6/11 request type tests — all 11 types now covered in `requests.test.ts` (commit 5541ccf).
- Gate 1 ✅: `M/A/D/R` change type badges — now rendered in `App.tsx:840-842` with color coding.
- Loop ✅: Exit state parity (`exited`/`stopped`) — fixed in both `loop.sh` and `loop.ps1` (commit 118de1d), with Pester source-map tests.
- Loop ✅: `STUCK_COUNT` reset on success — fixed in both scripts (commit 118de1d).

**Positive observations:**
- Gate 2: New `requests.test.ts` tests cover all 11 request types with concrete assertions (exact args, exact payload fields). Error path tests (`create_issues failure`, `invalid JSON`, `handler failure`) verify correct archival to `failed/` and queue error content.
- Gate 6: All 9 proof artifacts from iteration 15 exist and are consistent. Requests (15/15 pass), resume (19/19 pass), dashboard (38/38 pass), loop branch coverage (31/31 = 100%).
- Gate 1: Dashboard PID resolution now falls back through meta.json → active.json with liveness correction — addresses stale PID issue from prior sessions.
- Gate 1: Dashboard sidebar grouping (active vs recent sessions) and system theme support (dark mode classes) are well-implemented.
- Gate 4: `requests.ts` handlers now accept injectable `spawnSync` via options, improving testability for `handleUpdateIssue`, `handleDispatchChild`, `handleStopChild`, `handleQueryIssues`, `handleSpecBackfill`.

**Still open from prior reviews (not addressed this iteration):**
- Gate 1: `stuck_count` not visible in Dashboard status/details HoverCard.
- Gate 1: Docs overflow ellipsis menu not implemented (uses `flex-wrap` instead).
- Gate 2: `smoke.spec.ts` E2E tests still broken.
- Gate 2: Dashboard logic (log parsing, state normalization) has no unit tests.

---

## Review — 2026-03-15 — commit 1117ee1..2aedc45

**Verdict: FAIL** (10 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/requests.ts`, `aloop/cli/src/lib/plan.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/dashboard/src/components/ui/*`, `aloop/cli/dashboard/e2e/smoke.spec.ts`

- Gate 1: Dashboard UI is missing the spec-required `stuck_count` visibility in session status/details.
- Gate 1: Dashboard UI misses the "overflow extra docs into an end-of-row menu" requirement (uses standard horizontal overflow instead).
- Gate 1: Dashboard Commit detail view misses `M/A/D/R` change type badges (only shows `+`/`-` stats).
- Gate 2: Dashboard E2E tests (`smoke.spec.ts`) are outdated and broken — they use selectors and placeholders that no longer exist in the rewritten UI (e.g., checking for 'Aloop Dashboard' heading, 'Views' tab, old steer placeholder).
- Gate 2: Dashboard rewrite (2.4k lines) has zero unit tests for its complex logic (log parsing, health tooltips, state normalization).
- Gate 2: `requests.test.ts` still missing coverage for 6/11 request types: `update_issue`, `create_pr`, `merge_pr`, `dispatch_child`, `stop_child`, `query_issues`.
- Gate 3: Branch coverage for `requests.ts` (52.5%) and `plan.ts` (40%) remains far below the 80% threshold for new/touched modules.
- Gate 5: `requests.ts:307` — TypeScript error: `request.payload.title` accessed but `UpdateIssueRequest.payload` interface does not define `title`.
- Gate 5: 9 test failures persist: 6 in `dashboard.test.ts` due to path mismatch (`responses/` vs `queue/`), and 3 in `orchestrate.test.ts` due to `EACCES` on `mkdir /home/user`.
- Gate 4: Inconsistent handler implementation in `requests.ts` — `handleUpdateIssue`, `handleQueryIssues`, `handleDispatchChild` use `spawnSync` directly instead of the injectable `ghCommandRunner` dependency.

**Positive observations:**
- Gate 4: Modernized Dashboard UI using Shadcn/UI and Tailwind is highly polished and aesthetically superior to the previous version.
- Gate 4: `DOMPurify` correctly used for sanitizing markdown rendering in the dashboard.
- Gate 1: New dashboard hierarchy (Repo -> Project -> Issue -> Session) correctly implements the complex session grouping requested in SPEC.md.

---

## Review — 2026-03-14 19:45 — commit 53c8ad2..105706f

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/src/commands/gh_gate1.test.ts`, `aloop/bin/loop_branch_coverage.tests.sh`, `aloop/bin/loop.tests.ps1`

- Gate 3: New queue/ override code (loop.sh:1684-1731, loop.ps1:1779-1857) has zero branch coverage in test harnesses — `loop_branch_coverage.tests.sh` and `loop.tests.ps1` do not register or test queue.override_success, queue.override_failure, or queue.provider_fallback branches.
- Gate 3: New requests/ wait-loop code (loop.sh:1629-1655, loop.ps1:1745-1767) has zero branch coverage — neither harness registers or tests requests.wait_drain or requests.timeout branches.
- Gate 3: New opencode provider branch in invoke_provider (loop.sh:1047-1076) and Invoke-Provider (loop.ps1:516-529) has zero branch coverage — shell harness only tests claude success/failure and unsupported-provider paths.

Positive observations:
- Gate 1: Queue implementation correctly does NOT advance cyclePosition (uses `continue`), parses frontmatter, falls back to iteration provider when frontmatter provider unavailable. Spec-compliant.
- Gate 1: `finalizeWatchEntry` now returns `boolean`; `completion_finalized` only set on success. Prior finding resolved.
- Gate 2: gh.test.ts @aloop mention tests assert exact IDs (11, 12) with dedup coverage. CI log truncation test asserts specific line content. gh_gate1.test.ts covers both success/failure finalization paths with exact boolean assertions.
- Gate 3: gh.ts branch coverage is now 81.48% (was 63.32%), above 80% threshold. Prior finding resolved.
- Gate 5: `npm test` 8/8 pass, `tsc --noEmit` clean.
- Gate 6: All 7 proof artifacts exist at session artifacts/iter-5/ with internally consistent content (queue_file_deleted=true, cycle_position unchanged, waiting_logged=true, opencode model flag present).

---

## Review — 2026-03-14 12:20 — commit b9b359b..deb2a20

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

- Gate 1: Triage helpers are implemented but not integrated into a real orchestrator monitor-cycle polling path.
- Gate 1: Spec-required comment behaviors are incomplete (`needs_clarification` follow-up question, `question` answer comment, agent-footer marking, authorship filtering).
- Gate 2: New triage action tests assert partial command shape (`includes`) and miss key branches/error paths.
- Gate 3: `gh.ts` branch coverage is 78.46% (<80% threshold).
- Gate 6: Proof manifest artifact paths are not present in workspace, so evidence is not verifiable.

---

## Review — 2026-03-14 18:39 — commit 4caa6ca..2d119ab

**Verdict: FAIL** (6 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`

- Gate 1: `runGhWatchCycle` sets `completion_finalized=true` after `finalizeWatchEntry` regardless of whether PR creation/issue-summary side effects actually succeed; because `finalizeWatchEntry` swallows errors, completed issues can be permanently marked finalized without fulfilling spec-required completion actions.
- Gate 2: New tests do not exercise `@aloop` issue-comment trigger behavior (`collectNewFeedback` tests at `gh.test.ts:1943-2070` pass empty issue-comment arrays), leaving mention-detection and processed-issue-comment paths unverified.
- Gate 2: New tests do not validate CI failed-log ingestion/truncation paths added in `gh.ts` (`fetchFailedCheckLogs` + `buildFeedbackSteering` log block), so the `gh run view --log-failed` behavior is largely unproven.
- Gate 3: Branch coverage for touched `aloop/cli/src/commands/gh.ts` is 63.32% (<80%) from `npx c8 --all --include=src/commands/gh.ts tsx --test src/commands/gh.test.ts`.
- Gate 3: Touched loop runtime files `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` have no branch-coverage evidence in this iteration, violating the per-touched-file coverage gate.
- Gate 6: Proof manifest iteration 11 references artifacts that are missing from the workspace (`gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`), so evidence is not verifiable.

- Gate 5 observation: validation is green after dependency restore (`cd aloop/cli && npm test && npm run type-check && npm run build` all pass).

---

## Review — 2026-03-14 15:21 — commit f9cecb5..1b3e566

**Verdict: FAIL** (8 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/gh.ts`, `aloop/cli/src/commands/gh.test.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/dashboard/e2e/smoke.spec.ts`, proof artifacts

- Gate 1: `gh watch` never finalizes completed tracked sessions that started as `pending_completion` (no PR creation/issue summary when entries later flip to `completed`), which misses the spec flow for watch completion handling.
- Gate 1: GH feedback/re-trigger flow is partial vs spec: no `gh stop-watch` parity command, no explicit `@aloop`-mention/manual feedback trigger handling, and no CI failure-log ingestion path (`gh run view --log-failed`) despite spec requirements.
- Gate 2: New GH tests still contain weak assertions (`gh.test.ts:1877` checks `output.length > 0`) and do not directly cover several failure branches in `checkAndApplyPrFeedback` (fetch/parse/resume error paths swallowed by `catch`).
- Gate 3: Branch coverage for touched `aloop/cli/src/commands/gh.ts` is 65.30% (<80%) from `c8`; uncovered branch clusters include normalization/option parsing/feedback-resume/stop-policy paths (e.g., line ranges around 190-239, 284-343, 621-667, 820-858, 1703-1741).
- Gate 3: Touched dashboard files were not proven at threshold in submitted coverage evidence (`dashboard/src/App.tsx` and `dashboard/e2e/smoke.spec.ts` both reported 0% branch coverage in the run used for this review).
- Gate 4: Dead code remains in `gh.ts` (`fetchPrReviewComments` stores `/reviews` response in `response` but never uses it).
- Gate 5: Validation is not fully green: `cd aloop/cli && npm run type-check` fails with TS2345 in `src/commands/gh.test.ts` (lines 1937, 1953, 1964, 2032, 2050).
- Gate 6: Proof manifest iteration 43 is not verifiable in workspace (multiple declared artifacts missing), and the dashboard UI proof skipped screenshot evidence for a visual layout change.

---

## Review — 2026-03-14 13:58 — commit 34bf396..34bf5f0

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `TODO.md`

- Gate 3: Branch-coverage evidence is present for touched TypeScript files (`dashboard.ts` 82.98%, `orchestrate.ts` 88.25%), but no branch-coverage evidence was produced for touched runtime loop scripts `aloop/bin/loop.sh` and `aloop/bin/loop.ps1`; this violates the gate requirement for every touched file.
- Gate 6: Proof manifest iteration 27 references `dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, and `loop-exit-state-proof.txt`, but all three files are missing in the workspace, so claimed evidence is not verifiable.
- Gate 5 observation: validation is green for this range (`cd aloop/cli && npm test && npm run type-check && npm run build` all pass).

---

## Review — 2026-03-14 13:48 — commit 1ea560a..a31cc39

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `SPEC.md`, `TODO.md`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

- Gate 1: Triage polling was added, but the callsite is only initialization-time (`orchestrateCommandWithDeps`), not a continuous monitor-loop step; additionally, `action_taken: "steering_injected"` does not actually inject steering into child loop inputs.
- Gate 5: Validation gate remains red: `cd aloop/cli && npm test` fails with `src/commands/session.test.ts` (`resolveHomeDir trims trailing separators and falls back to os.homedir`), so full-suite regression safety is not met.
- Gate 6: Proof manifest lists `proof-run.log`, `monitor-cycle-proof.json`, and `triage-action-policy-proof.json`, but none exist in the workspace, so evidence is not verifiable.
- Gate 2 observation: triage tests are materially improved (exact GH arg assertions for clarification/question paths, mixed-classification batch case, and execGh error propagation checks).
- Gate 3 observation: measured with `c8` on `orchestrate.test.ts` run, `orchestrate.ts` branch coverage is 88.49% (>80% threshold).

---

## Review — 2026-03-14 13:18 — commit 6983165..48281d8

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/lib/session.mjs`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, proof artifacts

- Gate 1: `applyTriageResultsToIssue` marks actionable comments as `steering_injected` even when `issue.child_session` is absent; `injectSteeringToChildLoop` then no-ops, but the comment is still marked processed, so actionable guidance can be lost pre-dispatch.
- Gate 2: New steering tests only cover the path where `child_session` exists; there is no regression test for the no-child-session branch where steering injection is currently skipped.
- Gate 3 observation: Coverage evidence from `c8` shows touched production files above threshold (`lib/session.mjs` branches 93.33%, `src/commands/orchestrate.ts` branches 88.66%).
- Gate 5 observation: `cd aloop/cli && npm test && npm run type-check && npm run build` all pass.
- Gate 6 observation: previously missing proof artifacts now exist (`proof-run.log`, `monitor-cycle-proof.json`, `triage-action-policy-proof.json`) and are internally consistent with the triage/session work claimed in this range.

---

## Review — 2026-03-15 11:30 — commit 9935be6..98ce146

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/plan.ts`, `aloop/cli/src/lib/requests.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

- Gate 3: `plan.ts` branch coverage is 73.91% (<80% threshold) — Uncovered branches for mutateLoopPlan options (cycle, allTasksMarkedDone, forceReviewNext, forceProofNext, forcePlanNext) at lines 58, 61-64.
- Gate 1: Dashboard is missing spec-required `stuck_count` visibility and average duration context.
- Gate 4: `dashboard.ts` copy-paste duplication (lines 247-266) remains unresolved.
- Gate 6: No new proof artifacts provided for the latest dashboard and request coverage changes.

**Resolved from prior review (2026-03-15 10:15 — 0ad23eb..8a5baa1):**
- Gate 5 ✅: Duplicate `import path` in `orchestrate.test.ts` removed (commit 0666dda). Build is green.
- Gate 3 ✅: `requests.ts` branch coverage is now 84.09% (>=80% threshold) — thorough error-path coverage added in commit 98ce146.
- Gate 1 ✅: `M/A/D/R` change type badges implemented in Dashboard commit detail view (commit d21e747).
- Gate 1 ✅: Dashboard docs overflow ellipsis menu implemented (commit d21e747).

**Positive observations:**
- Gate 2: `requests.test.ts` has excellent depth, covering all 11 request types and numerous failure/edge cases (archive collisions, spawn failures, history lookup fallbacks).
- Gate 4: Dashboard UI rewrite is highly polished with tree sidebar, Lucide icons, and a rich activity log.

---

## Review — 2026-03-15 10:03 — commit e70cfd5..0fdfae9

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/bin/loop.sh`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/dashboard/src/App.tsx`, `aloop/cli/src/lib/plan.test.ts`, plus related spec/todo/research updates

- Gate 2: No tests were added for newly introduced dashboard behavior in this range (`iteration_running` synthetic rows, per-iteration `output.txt` fetch/render, output-header model extraction, and "No output available" fallback in `App.tsx`). Search across test files shows no assertions covering these paths.
- Gate 2: New backend branches in `dashboard.ts` (`loadArtifactManifests` output-header fallback, `resolvePid` fallback behavior, active-session status enrichment) were changed without corresponding test additions in this range.
- Gate 3: Branch-coverage evidence for touched files is missing. Iteration 29 proof only reports coverage for `plan.ts`, `requests.ts`, and `gh.ts`; there is no >=80% branch report for touched `loop.sh`, `dashboard.ts`, or `App.tsx`.
- Gate 6: Proof manifest iteration 29 is not verifiable in this workspace. All declared artifacts are missing (`plan-coverage.txt`, `requests-coverage.txt`, `gh-coverage.txt`, `dashboard-tests.txt`, `dashboard-props-implementation.txt`, `dashboard-pid-resolution.txt`, `stuck-reset-implementation.txt`, `dashboard-sidebar-width.txt`, `dashboard-overflow-tabs.txt`, `dashboard-health-tab.txt`).

**Positive observations:**
- Gate 1: Spec alignment improved in concrete areas — `stuck_count` visibility is now present in status/details, docs overflow is implemented (`MAX_VISIBLE_TABS` + overflow menu), and Health is surfaced as a docs tab in `App.tsx`.
- Gate 5: Validation is green for this range (`cd aloop/cli && npm test && npm run type-check && npm run build` all passed in this review run).

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
