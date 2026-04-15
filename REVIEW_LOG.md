# Review Log

## Review — 2026-04-15 — commit 0625250e..8f5fffc6

**Verdict: FAIL** (3 prior findings unresolved: F1, F2, [qa/P1])
**Scope:** SPEC.md (restore), QA_COVERAGE.md, QA_LOG.md, TODO.md

### Gate 1: Spec Compliance — PARTIAL

- WT-1 **resolved**: SPEC.md restored to 4086 lines via `git checkout HEAD -- SPEC.md` (commit `3b2d16df`). Correct.
- F3 **resolved**: `AppView.tsx` now re-exports `ArtifactEntry`, `ManifestPayload`, `IterationUsage` from `@/lib/types` (line 45) and `isImageArtifact`, `artifactUrl`, `parseManifest` from `@/lib/format` (line 51). `ArtifactViewer.tsx` imports via `../../AppView` — still indirect but no longer broken. Type-check no longer reports TS2459 errors for ArtifactViewer. Marked `[x]` in TODO.md correctly.
- F1 (5 untested `format.ts` functions) — still open, still in TODO.md as `[review]` task.
- F2 (`format.ts` 347 LOC) — still open, still in TODO.md as `[review]` task.

### Gate 2: Test Depth — FAIL

F1 unresolved. `format.test.ts` has no `describe` blocks for `formatTime`, `formatTimeShort`, `extractIterationUsage`, `parseManifest`, or `parseQACoveragePayload`. `parseLogLine` tests still cover only happy path + plain text — error events, verdict events, `commitHash` path, `filesChanged` array branches all untested.

### Gate 3: Coverage — FAIL

Same as F1. Five exported functions have 0% coverage; `parseLogLine` branch coverage well below 80%.

### Gate 4: Code Quality — PASS

No new source code in these two commits — only admin/QA files (SPEC.md restore, QA_LOG.md, QA_COVERAGE.md, TODO.md). No dead code or quality issues.

### Gate 5: Integration — FAIL

- `npm test`: 307/317 pass, **10 failures** (up from 8 pre-existing in prior review). 2 new failures match [qa/P1]: `App.coverage.test.ts` failures due to missing `sessionCost` prop on Sidebar and missing `children` on TooltipProvider wrapper.
- `npm run type-check`: exits 2 — 4 TS2769 errors in `App.coverage.test.ts` (lines 636, 636, 674, 695). These are the [qa/P1] regressions filed in commit `8f5fffc6`.

### Gate 6: Proof — N/A (acceptable skip)

Commits are admin/QA work only (SPEC.md restore, QA documentation). No observable output changes. QA_LOG.md documents the QA session results. Proof skip is the expected correct outcome.

### Gates 7, 8, 9 — N/A

No CSS/layout changes, no dependency updates, no docs changes needed.

### Summary

WT-1 and F3 are resolved. F1, F2, and [qa/P1] remain open and are tracked in TODO.md. No new `[review]` tasks needed — all open issues are already queued. Next build iteration must address [qa/P1] (TS2769 regressions) before F1 and F2.

---

## Review — 2026-04-14 — commit f5f5dcd8..0ca6a950 + working tree

**Verdict: FAIL** (3 prior findings still open; 7 new findings in working tree)
**Scope:** `aloop/cli/dashboard/src/lib/`, `aloop/cli/dashboard/src/AppView.tsx`, `aloop/cli/dashboard/src/components/`, `aloop/cli/dashboard/src/test-setup.ts`, `SPEC.md`

### Gate 1: Spec Compliance — FAIL

**Prior finding F1 (format.ts coverage) — still open.** Five exported functions in `format.ts` have zero test coverage: `formatTime` (line 60), `formatTimeShort` (line 66), `extractIterationUsage` (line 146), `parseManifest` (line 178), `parseQACoveragePayload` (line 268). Also confirmed: `parseLogLine` error/verdict/commitHash/filesChanged branches untested.

**Prior finding F2 (format.ts LOC) — still open.** `format.ts` is 347 LOC. Constitution Rule 7 requires < 150 LOC per file. Needs split (e.g., `format-time.ts`, `format-parse.ts`, `format-session.ts`).

**Prior finding F3 (ArtifactViewer type errors) — still open.** `ArtifactViewer.tsx` imports `ArtifactEntry` and `ManifestPayload` from `../../AppView`, which does not export them. `ArtifactViewer.test.tsx` imports `LogEntryRow`, `ManifestPayload`, `LogEntry` from AppView — same issue. `npm run type-check` exits 2 with 5 new TS errors (TS2459 × 4, TS7006 × 1). Fix: change imports to `@/lib/types`.

### Gate 2: Test Depth — PASS (for committed work)

`ansi.test.ts:105` shallow `.toBeDefined()` resolved in `2a0f9bf2` — now asserts `.toBe('255,0,0')`. Finding F1 above covers remaining test-depth gaps in format.ts.

### Gate 3: Coverage — FAIL

Same as prior finding F1. formatTime, formatTimeShort, extractIterationUsage, parseManifest, parseQACoveragePayload have 0% coverage.

### Gate 4: Code Quality — PASS (committed work only)

No dead code, no unused imports in committed lib modules. AppView.tsx re-exports are structurally correct (but see working-tree regressions below).

### Gate 5: Integration — PARTIAL

Dashboard `npm test`: 309/317 pass (8 failures pre-existing, confirmed against master). Dashboard `npm run type-check`: exits 2 — 5 new errors from ArtifactViewer (P1, prior finding F3) + 3 pre-existing TS2769 in App.coverage tests.

### Working Tree — CRITICAL REGRESSIONS (7 findings)

The following uncommitted changes must NOT be committed. They represent work that reverts previously committed features.

**[WT-1] SPEC.md gutted (staged):** `SPEC.md` has been truncated from 4086 lines to ~40 lines — the full project architecture spec replaced with an issue-scoped stub. SPEC.md is not in issue-6 scope. Constitution Rules 12 (one issue, one concern) and 18 (respect file ownership). **Revert this change entirely.**

**[WT-2] AppView.tsx lib extraction reverted (unstaged):** The working tree re-inlines the full ANSI parser and type definitions directly into `AppView.tsx` while removing the lib imports (`@/lib/ansi`, `@/lib/format`, `@/lib/types`). This undoes commit `cde50742` and creates dead code (lib files exist but are unused). **Revert this change entirely.**

**[WT-3] Touch targets stripped (unstaged):** `button.tsx`, `tabs.tsx`, `dropdown-menu.tsx` (4 elements) have `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` removed. These were committed accessibility improvements for WCAG 2.5.5 (44×44px touch targets). **Revert.**

**[WT-4] Touch-aware HoverCard reverted (unstaged):** `hover-card.tsx` custom `HoverCard` + `HoverCardTrigger` (touch tap-to-open, context provider) replaced with bare `HoverCardPrimitive.Root` / `HoverCardPrimitive.Trigger` pass-throughs. Previously committed feature. **Revert.**

**[WT-5] Touch-aware Tooltip reverted (unstaged):** `tooltip.tsx` custom `Tooltip` (isTouch detection, 2s auto-close timer, context provider) replaced with bare `TooltipPrimitive.Root` pass-through. Previously committed feature. **Revert.**

**[WT-6] Progress value safety removed (unstaged):** `progress.tsx` removes `Math.max(0, Math.min(100, value))` clamping and the `opacity-0` zero-value animation. The replacement `value ?? 0` is not equivalent: negative values, values > 100, and NaN are no longer guarded. **Revert.**

**[WT-7] matchMedia stub removed (unstaged):** `test-setup.ts` loses the `window.matchMedia` mock (32 lines). This will break any test using `useBreakpoint`, `useIsTouchDevice`, or any hook that calls `window.matchMedia`. QA confirmed tests pass with this stub present. **Revert.**

### Summary

Three prior review findings (F1, F2, F3) remain unresolved. Seven working-tree changes must be reverted before any commit — they undo previously committed work and introduce regressions. Fix order: (1) revert all 8 working-tree files to HEAD, (2) fix ArtifactViewer imports (F3), (3) add tests for 5 untested format.ts functions (F1), (4) split format.ts into ≤150 LOC modules (F2).

---

## Review — 2026-04-13 — commit aff01407..33cfe894

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `.github/workflows/ci.yml`, `README.md`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

### Gate 1: Spec Compliance — FAIL

The CI workflow (`ci.yml`) itself satisfies all 8 acceptance criteria from TASK_SPEC.md:
- ✅ ci.yml exists
- ✅ push + pull_request triggers on master, agent/*, aloop/*
- ✅ CLI tests via `bun run test` (correctly changed from `bun test` — bun's native runner incompatible with node:test)
- ✅ Dashboard tests via `npm test`
- ✅ Type checks for both CLI and dashboard packages
- ✅ Loop shell tests on Linux (7 suites including bats)
- ✅ PowerShell tests on Windows
- ✅ README CI badge at line 1

**However**, commit `aec9e571` made substantial changes to `aloop/cli/src/commands/orchestrate.ts` and `orchestrate.test.ts` — both explicitly listed as **Out of Scope** in TASK_SPEC.md: "Runtime/orchestrator logic changes in `aloop/cli/src/**` (Constitution Rules 2 and 6)". This violates Constitution Rules 12 (one issue, one concern) and 18 (respect file ownership).

Five behavior changes were bundled into this CI issue:
1. `validateDoR`: changed acceptance criteria detection regex
2. `validateDoR`: removed criterion 5 (dor_validated circular check)
3. `getDispatchableIssues`: added `dor_validated` guard
4. `applyEstimateResults`: expanded status progression from `Needs refinement` to 3 statuses
5. `checkPrGates`: changed 'pass' to 'pending' when CI workflows exist but no checks ran
6. `reviewPrDiff`: changed 'flag-for-human' → 'approve' when no reviewer configured (**security regression**)
7. `monitorChildSessions`: added `state='failed'`/`status='Blocked'` tracking for stopped children
8. `launchChildLoop`: added SPEC.md seeding from issue body

The `reviewPrDiff` auto-approve change (finding #6) is the most critical: it replaces the safe 'flag-for-human' default with silent auto-approval, enabling automated merges without any review when no reviewer is configured. This is a meaningful weakening of a security gate.

### Gate 2: Test Depth — Pass (conditional on Gate 1)

The orchestrate.test.ts changes that accompany the production changes are technically coherent:
- `dor_validated: false` additions in test fixtures fix a real regression (previously missing flag caused false positives)
- `statusCheckRollup` mock format aligns with actual GitHub GraphQL response shape
- `checkPrGates` test at line ~430: assertion updated to 'pass' on API error (tests gate behavior correctly, not arbitrary)

If Gate 1 findings are resolved (revert out-of-scope changes), this gate passes on the remaining CI-only changes.

### Gate 5: Integration — Conditional pass

On master: 2 pre-existing failures, 963 pass (966 total).
On this branch (worktree context): 24 failures noted, but yaml.test.ts failures appear pre-existing to this branch (yaml.ts/yaml.test.ts not modified). The aec9e571 commit fixed 27 pre-existing orchestrate test failures; yaml failures are separate and pre-date this branch.

### Gate 6: Proof — N/A

No proof manifests found. ci.yml is a config file — CI workflow proof would require triggering an actual GitHub Actions run (impossible in the current environment). Proof skip is acceptable per Gate 6 rules for config-file work.

### Gates 3, 4, 7, 8, 9

- Gate 3: N/A (CI config has no branch coverage metric)
- Gate 4: Out-of-scope changes aside, no dead code or quality issues in ci.yml itself
- Gate 7: N/A (no UI changes)
- Gate 8: No VERSIONS.md entries for GitHub Actions; `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/setup-node@v4`, `actions/upload-artifact@v4` — pinned to major versions (acceptable)
- Gate 9: README line 1 has CI badge pointing to `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg` ✅

## Review — 2026-04-14 — commit 262d936c..cde50742

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/lib/ansi.ts`, `aloop/cli/dashboard/src/lib/format.ts`, `aloop/cli/dashboard/src/lib/types.ts`, `aloop/cli/dashboard/src/lib/ansi.test.ts`, `aloop/cli/dashboard/src/lib/format.test.ts`, `aloop/cli/dashboard/src/AppView.tsx`

### Gate 1: Spec Compliance — PASS

Utility extraction matches spec intent: `ansi.ts` (118 LOC), `format.ts` (347 LOC), and `types.ts` (123 LOC) extracted from AppView; `ansi.test.ts` and `format.test.ts` added; backward-compatibility re-exports in AppView.tsx preserve all existing consumers. No UI dependencies in the lib modules (`marked` is a library utility, acceptable). The TODO task marked `[x]` correctly describes the work done.

One spec violation noted: `format.ts` at 347 LOC violates Constitution Rule 7 (< 150 LOC per file) — see Gate 3 / Rule 7 finding below.

### Gate 2: Test Depth — FAIL

- `ansi.test.ts:105`: `expect(segs[0].style.fg).toBeDefined()` — shallow existence check on a 256-colour fg value. A broken palette lookup (wrong index, wrong formula) passes this test. Should assert the exact RGB string (e.g. `'215,0,0'` for index 196). Written as [review] task.

### Gate 3: Coverage — FAIL

`format.ts` exports 24 symbols. Five have zero test coverage:
- `formatTime` (line 60) — no describe block
- `formatTimeShort` (line 66) — no describe block
- `extractIterationUsage` (line 146) — 3+ branches (null input, NaN cost, zero/negative cost) untested
- `parseManifest` (line 178) — complex nested parsing with 8+ conditional branches, untested
- `parseQACoveragePayload` (line 268) — status normalization (`PASS`/`FAIL`/`UNTESTED`) untested

`parseLogLine` tests cover happy path and plain text only; error events, verdict events, commitHash path, and filesChanged array parsing are all untested branches.

Additionally, `format.ts` is 347 LOC — more than double the 150 LOC target (Constitution Rule 7). Requires a split into focused sub-modules.

### Gate 4: Code Quality — PASS

No dead code, no unused imports, no copy-paste duplication. `AppView.tsx` re-exports are clean and complete.

### Gate 5: Integration — PASS

New lib tests: 82/82 pass (`ansi.test.ts` + `format.test.ts`). Pre-existing integration test failures (4–5 in `App.coverage.test.ts`, `App.coverage.integration-sidebar.test.ts`, `App.coverage.integration-app.test.ts`) appear pre-existing — these files were last modified before this branch commit and the failures are unrelated to the utility extraction.

### Gate 6: Proof — PASS (skip acceptable)

No proof manifest found in the session artifacts for this iteration. This work is a pure internal refactoring (moving functions to lib modules with re-export wrappers) — no observable UI output changes. Proof skip with empty artifacts is the expected correct outcome per Gate 6 rules.

### Gate 7: N/A — No CSS or layout changes.

### Gate 8: N/A — No dependency version changes.

### Gate 9: N/A — No documentation changes needed for internal utility extraction.

---

## Review — 2026-04-13 — commit ef60dc7e..d0a300bf

**Verdict: PASS** (prior findings resolved)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `.github/workflows/ci.yml`, `README.md`

- Gate 1: orchestrate.ts production code is now identical to master — the 8 out-of-scope behavior changes (including `reviewPrDiff` security regression) have been reverted. Remaining diff is orchestrate.test.ts fixture improvements only (statusCheckRollup format, dor_validated guards in failure-path tests) — no production behavior changes.
- Gate 2: orchestrate.test.ts:2723-2813 — `statusCheckRollup` fixtures correctly match GitHub GraphQL API format; `dor_validated: false` in failure tests makes intent explicit. Thorough.
- Gate 5: QA log confirms 452 CLI tests pass, 148 dashboard tests pass; 2 deferred pre-existing script exit-code bugs (out of scope).
- Gates 3, 6, 7: N/A for CI config work.
- Gate 8: Actions pinned to major versions — acceptable.
- Gate 9: README CI badge present at line 1.

All prior [review] tasks resolved.

---
