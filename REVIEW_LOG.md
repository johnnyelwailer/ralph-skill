# Review Log

## Review — 2026-03-27 — commit 253261353..862676a99

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/components/session/SessionCard.tsx`, `SessionCard.stories.tsx`, `SteerInput.tsx`, `SteerInput.stories.tsx`, `AppView.tsx`

**Commits reviewed:**
- `bea6cb7c2` feat: extract SessionCard into standalone component with Storybook stories
- `862676a99` feat: extract SteerInput into standalone component with Storybook stories

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- Both extractions match their TODO tasks exactly. SessionCard.tsx removes inner function from AppView.tsx:502 and exposes an explicit props interface. SteerInput.tsx removes the Footer inner function from ~line 1651. State management correctly kept in AppView.tsx (onOpenContextMenu callback carries setSuppressClickSessionId/setContextMenuPos/setContextMenuSessionId). 10 SessionCard stories + 7 SteerInput stories created.

**Gate 2 — Test Depth: FAIL**
- `SessionCard.tsx` has no `.test.tsx` file. The component has testable branches: suppressClick=true path (skips onSelect, calls onClearSuppressClick), tooltip tooltip content rendering with/without cost, stuckCount>0 showing red text. Prior extracted components in this same PR all have unit tests.
- `SteerInput.tsx` has no `.test.tsx` file. The component has testable branches: isRunning=true renders Stop dropdown not Resume button, isRunning=false renders Resume not Stop, Send button disabled on empty steerInstruction, Send button disabled on steerSubmitting=true, Enter-without-Shift keydown fires onSteer.
- Reference pattern: `StatusDot.test.tsx` tests 9 scenarios with concrete text assertions; `PhaseBadge.test.tsx` and `ElapsedTimer.test.tsx` follow the same pattern. SessionCard and SteerInput skip this entirely.

**Gate 3 — Coverage: FAIL**
- SessionCard.tsx: 0% branch coverage (no test file).
- SteerInput.tsx: 0% branch coverage (no test file).

**Gate 4 — Code Quality: PASS**
- No dead code. `openMenu` wrapper in SessionCard.tsx is used in two callsites (longPress + contextMenu). No unused imports — `useLongPress` removed from AppView.tsx and correctly placed in SessionCard.tsx. `GitBranch`, `Send`, `Square`, `Zap`, `ChevronDown`, `Play`, `DropdownMenu*`, `Textarea` all still used in AppView.tsx.
- Constitution Rule 7 (< 150 LOC): SessionCard.tsx = 100 lines ✓, SteerInput.tsx = 80 lines ✓.

**Gate 5 — Integration Sanity: PASS**
- `tsc --noEmit`: clean.
- `npm test`: 32 failures / 1094 passes — same pre-existing baseline as prior review. No new failures.

**Gate 6 — Proof: FAIL**
- No screenshots in `proof-artifacts/` for any of the 17 new stories (10 SessionCard + 7 SteerInput). All previously extracted components in this PR have screenshots: StatusDot (7 screenshots), ElapsedTimer (3), PhaseBadge (6), ConnectionIndicator (3), CostDisplay (3), ArtifactViewer (2). The two new component stories have zero. The work is observable UI (Storybook stories) — skipping proof is not acceptable here.
- Iter-14 and iter-21 artifacts contain only `output.txt` — no proof-manifest.json.

**Gate 7 — Layout: SKIP**
- Purely a code extraction refactor. CSS classes, JSX structure, and layout behavior are identical to the originals in AppView.tsx. No new CSS or layout changes.

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS** (no user-facing behavior changes)

---

## Review — 2026-03-27 — commit 75e241b48..899d1277f

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/components/session/SessionCard.test.tsx`, `SteerInput.test.tsx`, `ActivityLog.tsx`, `ActivityLog.stories.tsx`, `activityLogHelpers.ts`, `AppView.tsx`, `App.coverage.integration-app.test.ts`, proof-artifacts/

**Commits reviewed:**
- `6a1eeeca0` test: add SessionCard unit tests covering key branches
- `734a2b7e8` test: add SteerInput.test.tsx covering send, stop/resume, and keyboard branches
- `f16697994` fix(test): resolve ambiguous Stop button selector in integration tests
- `8c71ef05d` feat: add ActivityLog.stories.tsx and remove duplicate inline definitions from AppView.tsx
- `218df13c1` chore(qa): session iter 25 — unit tests pass, Gate 6 screenshots captured
- `899d1277f` chore(qa): session iter 26 — ActivityLog component verified, integration tests pass, 9 screenshots captured

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- All three prior [review] tasks resolved: SessionCard.test.tsx added with 12 tests, SteerInput.test.tsx added with 15 tests, and Playwright screenshots captured for all 17 stories.
- Integration test Stop button selector fixed from `/stop/i` to `/stop loop options/i` — matches the [qa/P1] task exactly.
- ActivityLog extracted to `ActivityLog.tsx` (616 LOC) + `activityLogHelpers.ts` (149 LOC), with 9 Storybook stories as specified by the [qa/P1] task.

**Gate 2 — Test Depth: PASS (with minor caveats)**
- `SessionCard.test.tsx`: Covers suppressClick (true/false with concrete spy assertions), cardCost null/number/formatting (4 decimal places exact string match), tooltip with session id, costUnavailable, and stuckCount. Line 168 uses `toBeTruthy()` to check element existence — marginal per Gate 2, but followed by a concrete `classList.contains('text-red-500')` assertion on line 169 that would fail on a broken implementation.
- `SteerInput.test.tsx`: Covers isRunning/Stop/Resume rendering with specific text queries, Send disabled on empty/whitespace/steerSubmitting, Enter-without-Shift calls onSteer, Stop menu items `onStop(false)` and `onStop(true)` with exact argument assertions, Resume click calls onResume. Line 102 finds resume button by `svg.lucide-play` class — fragile but functional.

**Gate 3 — Coverage: FAIL**
- `SessionCard.test.tsx` and `SteerInput.test.tsx`: PASS — prior findings resolved, branches covered.
- `ActivityLog.tsx` (616-line new module): 0% unit test coverage. `parseLogLine` is tested via re-export in `parseLogLine.test.tsx`, but `ActivityPanel`'s React logic is untested. Uncovered branches: (a) `withCurrent` when `isRunning=false || currentIteration===null` short-circuits, (b) `hasResult` suppression of synthetic entry when current iteration already has a complete/error entry within the current run, (c) `deduped` deduplication of multiple `session_start` events, (d) `loadOutput` fetch success, non-ok response (`outputText=''`), and catch path in `LogEntryRow`. Constitution Rule 11 and Gate 3 both require test coverage for new modules.

**Gate 4 — Code Quality: FAIL**
- `ActivityLog.tsx` is 616 lines. Constitution Rule 7 mandates < 150 LOC per file and "If a file grows beyond that, split it." The file contains four separable units: `ActivityPanel` (~116 LOC), `LogEntryRow` (~220 LOC), `ImageLightbox` (~15 LOC), `ArtifactComparisonDialog` (~215 LOC), plus `findBaselineIterations`. The builder consolidated all into one file despite creating a new module from scratch.
- `activityLogHelpers.ts`: 149 lines ✓ — exactly at limit.
- No dead code, no unused imports in changed files ✓.

**Gate 5 — Integration Sanity: PASS**
- `tsc --noEmit`: clean.
- `npm test`: 28 files / 295 tests — all pass. One transient failure in `useCost.test.ts:105` on first run cleared on re-run (pre-existing flaky test, not a regression).

**Gate 6 — Proof: PASS**
- SessionCard: 11 screenshots in `proof-artifacts/` ✓
- SteerInput: 7 screenshots ✓
- ActivityLog: 10 screenshots (Empty, SessionStart, IterationComplete, WithArtifacts, ErrorIteration, MultipleIterations, RunningIteration, ProviderCooldown, ReviewVerdict, SidebarCheck) ✓

**Gate 7 — Layout: SKIP** (no CSS/layout changes — extraction only)

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS** (no user-facing behavior changes)

**Gate 10 — QA Coverage: PASS**
- QA_COVERAGE.md: 19/20 features PASS (95%); ProgressBar extraction (1 feature) pending — not stale (just added). Above 30% threshold. No stale [qa/P1] bugs (ProgressBar P1 is new, not multi-iteration).

---

## Review — 2026-03-27 — commit dc13ca694..c45a7759f

**Verdict: PASS** (0 findings)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/dashboard/src/components/shared/StatusDot.tsx`, `aloop/cli/dashboard/src/components/shared/StatusDot.test.tsx`, `proof-artifacts/statusdot-{exited,stuck,unhealthy,unknown}.png`

**Commits reviewed:**
- `8ea8254e9` fix: address review blockers — StatusDot tests + proof screenshots
- `cba1c26be` fix: make child loops run without iteration cap in orchestrate mode
- `c45a7759f` test: fix broken import and add max_iterations dispatch tests

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- Iteration cap fix matches SPEC-ADDENDUM §"Orchestrate Mode: No Iteration Cap". Implementation uses `0` as "unlimited" sentinel via CLI flag `--max-iterations 0`, achieving identical behavior to spec's "absent from loop-plan.json" language.
- Prior review findings (StatusDot shallow tests, missing screenshots) resolved in `8ea8254e9`.

**Gate 2 — Test Depth: PASS**
- New tests (`orchestrate.test.ts:2472–2503`) assert exact values: `'0'` for undefined maxIterations, `'50'` for explicit Linux, `'25'` for explicit win32.
- StatusDot tests now use `screen.getByText('Running')` etc. via `sr-only` spans — concrete text assertions, not class checks.

**Gate 3 — Coverage: PASS**
- All 3 new code paths in `launchChildLoop` tested (undefined → 0, explicit Linux, explicit win32).
- Shell script changes have no unit test mechanism; covered at TS boundary.

**Gate 4 — Code Quality: PASS**
- No dead code. Minimal focused changes. Constitution Rule 1 satisfied (loop.sh modification adds only a condition check, no new functions).

**Gate 5 — Integration Sanity: PASS**
- `tsc --noEmit`: clean.
- `npm test`: 32 failures — all pre-existing (confirmed by baseline check). 3 new max_iterations tests pass (tests 16, 17, 18 in launchChildLoop suite).

**Gate 6 — Proof: PASS**
- StatusDot: 7/7 variant screenshots in `proof-artifacts/` (exited, stuck, unhealthy, unknown added in `8ea8254e9`; running, stopped, error existed previously). No proof-manifest.json present (minor administrative gap — screenshots themselves are sufficient evidence).
- Iteration cap: purely internal code change — empty proof is the correct outcome.

**Gate 7 — Layout: SKIP** (no UI changes)

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS**
- No doc changes required for internal fix. P2 loop.sh help text gap (opencode provider missing, wrong round-robin default) is tracked in TODO.md as a spec-gap item.

---

## Review — 2026-03-27 — commit 66f15d126..4cc6d7305

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/components/session/ActivityLog.tsx` (barrel), `ActivityPanel.tsx`, `LogEntryRow.tsx`, `ArtifactComparisonDialog.tsx`, `ActivityLog.test.tsx`, `AppView.tsx`

**Commits reviewed:**
- `a53963ea8` refactor: split ActivityLog.tsx into ActivityPanel, LogEntryRow, ArtifactComparisonDialog
- `4cc6d7305` chore(qa): session iter 27 — ActivityLog split verified, 2 bugs filed

**Prior findings resolution:**
- Gate 4 (ActivityLog.tsx 616 lines): RESOLVED — ActivityLog.tsx is now a 5-line barrel re-export. ActivityPanel.tsx = 103 lines ✓, LogEntryRow.tsx = 287 lines ✗ (pre-existing P2 bug), ArtifactComparisonDialog.tsx = 219 lines ✗ (new finding).
- Gate 3 (ActivityLog.test.tsx): RESOLVED in part — test file exists and covers ActivityPanel and LogEntryRow branches. One test is tautological (new finding).

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- Both prior [review] tasks addressed: ActivityLog.tsx split complete, ActivityLog.test.tsx created. AppView.tsx updated to import/re-export from barrel (pattern intentional — used by tests like ArtifactViewer.test.tsx:5 and formatHelpers.test.tsx:10).

**Gate 2 — Test Depth: FAIL**
- `ActivityLog.test.tsx:158-177` test "suppresses synthetic entry when result timestamp >= iterationStartedAt" has a tautological assertion. The `screen.getByText(/2 events/)` assertion checks `deduped.length` (always 2 regardless of synthetic entry presence). With `iterationStartedAt = ts3 (now+200s)` and result timestamp `ts2 (now+100s)`, `ts2 < ts3` → `hasResult=false` → synthetic spinner IS added, but the test never calls `document.querySelector('.animate-spin')` to verify presence/absence. A broken `hasResult` guard that never suppressed would still pass this test.

**Gate 3 — Coverage: FAIL**
- `ActivityPanel.tsx`: well-covered by `ActivityLog.test.tsx` — deduped/withCurrent/hasResult branches all tested ✓
- `LogEntryRow.tsx`: loadOutput success/non-ok/throw/null-iteration covered ✓
- `ArtifactComparisonDialog.tsx` (219 lines, new module): 0% branch coverage. Uncovered: comparison mode switching (3-state tab click), keyboard ArrowLeft/ArrowRight on slider, baseline dropdown onChange with `Number(value)` parse, diff_percentage badge color branches (< 5 / 5-20 / ≥ 20), no-baseline fallback path.

**Gate 4 — Code Quality: FAIL**
- `ArtifactComparisonDialog.tsx` is 219 lines — violates Constitution Rule 7 (< 150 LOC). The prior review task estimated "~215 LOC" but the Constitution is non-negotiable. File needs further splitting into header/controls, side-by-side view, slider view, diff-overlay view.
- `ActivityPanel.tsx` (103 lines), `ActivityLog.tsx` (5 lines barrel) ✓.
- `LogEntryRow.tsx` (287 lines) — pre-existing P2 bug already tracked.
- No dead code in new files. AppView.tsx re-exports are consumed by tests (ArtifactViewer.test.tsx, formatHelpers.test.tsx, etc.) — intentional pattern.

**Gate 5 — Integration Sanity: PASS (unverified — cannot run in this environment)**
- QA iter 27 commit message states "ActivityLog split verified." TypeScript clean per QA report.

**Gate 6 — Proof: PASS**
- Pure code reorganization (splitting one file into multiple). No new UI or visual behavior. Existing ActivityLog screenshots from iter 26/27 remain valid. Empty proof artifacts are the expected correct outcome.

**Gate 7 — Layout: SKIP** (no CSS/layout changes)

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS** (no user-facing behavior changes)

---
