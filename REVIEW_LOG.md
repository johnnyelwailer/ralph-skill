# Review Log

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
