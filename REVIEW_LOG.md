# Review Log

## Review — 2026-04-14 17:35 — commit 553d9449..234ecc41

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`, `src/components/layout/DocsPanel.tsx`, `src/components/layout/DocsPanel.test.tsx`, `src/lib/log.ts`, `src/lib/ansi.ts`, `src/lib/formatters.ts`, `src/App.coverage.test.ts`, `TODO.md`

**Build summary:** Header, Footer, DocsPanel components extracted from AppView.tsx; utility functions extracted to lib/; QA found and fixed 3 test failures and 5 type errors. All 243 tests pass, type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 243 tests, all pass. `tsc --noEmit` → clean.
**Gate 8 — PASS:** react 18.3.1, tailwindcss 3.4.14, typescript 5.6.3, vitest 4.1.0 all match VERSIONS.md.
**Gate 9 — PASS:** No user-facing docs changed; internal refactoring only.
**Gate 1 — PASS (partial):** Extracted Footer, Header, DocsPanel match spec. Remaining extractions (AppShell, MainPanel, hooks, Sidebar, ActivityPanel) correctly tracked in "Up Next".

- **Gate 3 FAIL:** `DocsPanel.tsx` is a new module requiring ≥90% branch coverage. `DocContent` wide-mode layout path (lines 126–137) untested. `HealthPanel` cooldown/failed/unknown status branches untested — only 'healthy' covered. Wrote `[review]` task.

- **Gate 4 FAIL:** `lib/log.ts` is 381 LOC. Created in this build (commit 8df30426). Violates spec acceptance criterion #2 ("no source file >200 LOC excl. ui/") and Constitution Rule 7. QA agent caught DocsPanel.tsx at 204 LOC and Header.tsx at 385 LOC but missed log.ts. Wrote `[review]` task.

- **Gate 4 FAIL (minor):** `HealthPanel` in `DocsPanel.tsx` duplicates the cooldown-remaining IIFE at lines ~179 and ~195. Extract to `remainingSecs` variable. Wrote `[review]` task.

- **Gate 7 FAIL:** Header, Footer, DocsPanel are layout components. No Playwright browser verification was run. Spec says "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence. Wrote `[review]` task.

## Review — 2026-04-14 17:48 — commit 015e65b6..3aabbd0c

**Verdict: FAIL** (3 prior findings unresolved; 1 prior finding resolved)
**Scope:** `src/components/layout/DocsPanel.test.tsx` (new branch coverage tests)

**Build summary:** Commit 70094e0f added 8 new tests to DocsPanel.test.tsx covering DocContent wide mode and all HealthPanel status branches. All 250 tests pass (7 more than prior review due to new tests), type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.
**Gate 8 — PASS:** No dependency changes in this iteration.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 — PASS (resolved):** DocsPanel branch coverage gaps closed. New tests cover: `DocContent` with `wide=true` + SPEC file (sticky sidebar layout path), `DocContent` with `wide=true` + non-SPEC file (no TOC path), `HealthPanel` cooldown with future `cooldownUntil` (time-remaining display), cooldown with past `cooldownUntil` (ending… label), `status='failed'`, `status='unknown'`. All 15 DocsPanel tests pass.

- **Gate 4 FAIL (persists):** `lib/log.ts` is 381 LOC — unchanged since prior review. Spec acceptance criterion #2 and Constitution Rule 7 require ≤200 LOC. Split into `log-types.ts`, `log-parse.ts`, `log-session.ts` as directed in TODO.md.

- **Gate 4 FAIL (persists):** Duplicate cooldown IIFE in `DocsPanel.tsx` — unchanged. `Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000))` appears at line 179 and again inline at line 195. Extract to `remainingSecs` variable before the JSX return.

- **Gate 7 FAIL (persists):** No Playwright/browser verification performed. Spec acceptance criterion: "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence for layout extractions (Header, Footer, DocsPanel).

**Carried defects (not new this iteration):** `DocsPanel.tsx` 204 LOC (QA P1 open), `Header.tsx` 385 LOC (Up Next task).

## Review — 2026-04-14 17:58 — commit d9498aa3

**Verdict: FAIL** (2 prior findings unresolved; 2 prior findings resolved)
**Scope:** `src/components/layout/DocsPanel.tsx` (IIFE fix + LOC trim to 199)

**Build summary:** Commit d9498aa3 extracted duplicate cooldown IIFE to `remainingSecs` variable and trimmed DocsPanel.tsx to 199 LOC. All 250 tests pass, type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.

- **Gate 4 (DocsPanel IIFE) — PASS (resolved):** `remainingSecs` computed once at line 164, reused at lines 177 and 189. Duplicate IIFE eliminated. `DocsPanel.tsx` is 199 LOC — within ≤200 limit. Both QA P1 tasks (IIFE and LOC trim) are closed.

- **Gate 4 (log.ts LOC) — FAIL (persists):** `src/lib/log.ts` is 381 LOC — unchanged since commit 8df30426. Violates spec criterion #2 and Constitution Rule 7. Must split into `log-types.ts`, `log-parse.ts`, `log-session.ts` per TODO.md.

- **Gate 7 — FAIL (persists):** No Playwright/browser verification performed. Spec acceptance criterion: "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence for layout extractions (Header, Footer, DocsPanel).

---

## Review — 2026-04-14 18:02 — commit d9498aa3..ab9fb46b

**Verdict: FAIL** (2 prior findings unresolved; 0 new findings)
**Scope:** `REVIEW_LOG.md` only (QA re-test iteration — no code changes)

**Build summary:** Commit ab9fb46b is a QA re-test pass. It only appended prior review entries to REVIEW_LOG.md. No source files were changed. All 250 tests pass, type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.
**Gate 6 — PASS (N/A):** QA-only commit with no observable output; empty proof is correct.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 4 (log.ts LOC) — FAIL (persists):** `src/lib/log.ts` is 381 LOC — confirmed unchanged. Violates spec criterion #2 and Constitution Rule 7. `[review]` task remains open in TODO.md: split into `log-types.ts`, `log-parse.ts`, `log-session.ts`.

- **Gate 7 — FAIL (persists):** No Playwright/browser verification performed across any iteration. Spec acceptance criterion: "Dashboard renders identically before and after refactor." `[review]` task remains open in TODO.md. Gate 7 is a mandatory fail without browser evidence for layout component extractions (Header, Footer, DocsPanel).

---

## Review — 2026-04-14 18:20 — commit 62f50318..9ce0a643

**Verdict: FAIL** (2 new findings → written to TODO.md as [review] tasks; 1 prior finding resolved; 1 prior finding persists)
**Scope:** `src/lib/log-types.ts` (new), `src/lib/log-parse.ts` (new), `src/lib/log-session.ts` (new), `src/lib/log.ts` (barrel), `SPEC.md` (truncated by QA)

**Build summary:** Commit 69dc3bfb split `log.ts` (382 LOC) into three modules — `log-types.ts` (102 LOC), `log-parse.ts` (173 LOC), `log-session.ts` (111 LOC), `log.ts` (3-line barrel re-export). All 250 tests pass, tsc clean. Commit 9ce0a643 is a QA-only iteration; it did not add tests but did modify SPEC.md (4086 → 64 lines).

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.
**Gate 6 — PASS:** Pure internal refactoring; no observable output. Empty proof is the correct outcome.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.
**Gate 1 — PASS (for this iteration):** log.ts split resolves the tracked [review] task. Remaining spec criteria (AppView <100 LOC, AppShell/MainPanel existence) are correctly staged in "Up Next".
**Gate 2 — PASS:** No new test code; refactoring relies on existing tests. Existing tests assert concrete values — not existence or truthy checks.

- **Gate 4 (log.ts LOC) — PASS (resolved):** `log.ts` is a 3-line barrel. All three split files are ≤200 LOC. Constitution Rule 7 and spec criterion #2 now satisfied. Prior [review] task closed.

- **Gate 3 FAIL (new):** `log-session.ts` is a new module requiring ≥90% branch coverage. `latestQaCoverageRefreshSignal` has no unit test — only indirect integration coverage. The `!log` early-return and non-JSON-line skip branches are not explicitly covered. `toSession`'s `project_root` IIFE (lines 8-12) is also never exercised. Wrote `[review]` task.

- **Gate 4 FAIL (new):** QA agent commit 9ce0a643 truncated `SPEC.md` from 4086 lines (full project spec) to 64 lines (sub-issue spec). Constitution Rule 16 prohibits QA agents from modifying source or spec files. Wrote `[review]` task.

- **Gate 7 — FAIL (persists):** No Playwright/browser verification across any iteration. `[review]` task remains open in TODO.md.

---

## Review — 2026-04-14 18:30 — commit d979be11..6cc26a60

**Verdict: FAIL** (2 prior findings persist; 1 prior finding resolved)
**Scope:** `SPEC.md` (restored), `TODO.md` (Gate 4 task closed), `QA_COVERAGE.md`, `QA_LOG.md`

**Build summary:** Commit `6a72a5f9` restored SPEC.md from 64 lines back to the full 4086-line project spec and marked the Gate 4 [review] task done in TODO.md. Commit `6cc26a60` is a QA re-test pass — updates QA_COVERAGE.md and QA_LOG.md only; no source changes. No new code, no new tests.

**Gate 1 — PASS:** SPEC.md confirmed 4086 lines; Gate 4 TODO.md task correctly marked [x].
**Gate 2 — N/A:** No new test code in either commit.
**Gate 4 (SPEC.md restore) — PASS (resolved):** QA agent truncation of SPEC.md (9ce0a643) is now undone. Prior [review] task closed.
**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.
**Gate 6 — PASS:** Both commits are pure documentation/log updates with no observable output. Empty proof is the correct expected outcome.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 — FAIL (persists):** `log-session.ts` coverage gaps unchanged since prior review. `latestQaCoverageRefreshSignal` has no unit test covering: (1) `!log` early-return branch, (2) non-JSON line skip (the `catch` branch), (3) `iteration_complete` where `phase !== 'qa'` (non-QA phase does not return early but must not match). `toSession` `project_root` IIFE (lines 8–12) is never exercised by any test — no test passes `{ project_root: '/home/user/my-project' }` and asserts `projectName === 'my-project'`. Confirmed: `grep -r "project_root" src/**/*.test.*` returns no matches. [review] task remains open in TODO.md.

- **Gate 7 — FAIL (persists):** No Playwright/browser verification performed. QA reported `libatk-1.0.so.0` missing in container — Playwright cannot launch. curl-based checks confirm HTML, JS, CSS, SSE all functional, but visual rendering (panel layout, Header/Footer/DocsPanel positions) is unverified. Gate 7 is a mandatory fail without browser evidence for layout component changes. [review] task remains open in TODO.md.

---

## Review — 2026-04-14 19:29 — commit 6cc26a60..cd3b32ed

**Verdict: FAIL** (2 new findings; 1 prior finding resolved; 1 prior finding persists)
**Scope:** `src/lib/log-session.test.ts` (new), `src/components/layout/Header.tsx` (reduced), `src/components/layout/StatusIndicators.tsx` (new), `src/components/layout/QACoverageBadge.tsx` (new), `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

**Build summary:** Commit `b7ee3e9c` added 7 unit tests for `log-session.ts` covering all flagged branches. Commit `9899c43a` split `Header.tsx` (385 LOC) into `Header.tsx` (168 LOC), `StatusIndicators.tsx` (98 LOC), and `QACoverageBadge.tsx` (142 LOC); Header.tsx re-exports sub-components for backward compat. Commit `cd3b32ed` is a QA re-test pass confirming 257/257 dashboard tests pass and exposing 33 pre-existing failures in non-dashboard tests.

**Gate 5 — PASS:** `vitest run` (from `aloop/cli/dashboard/`) → 24 test files, 257 tests, all pass. `tsc --noEmit` → 0 errors. Note: 33 failures in broader test suite (`dashboard.test.ts`, `orchestrate.test.ts`, `process-requests.test.ts`, `github-monitor.test.ts`) are pre-existing — QA confirms test files unchanged since commit `6a72a5f9`; tracked as `[qa/P1]` in TODO.md.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.
**Gate 2 — PASS:** `log-session.test.ts` uses `.toBe()`, `.toBeNull()`, `.toContain()` — concrete value assertions, not mere truthy checks.
**Gate 4 (Header.tsx LOC) — PASS (resolved):** `Header.tsx` = 168 LOC, `StatusIndicators.tsx` = 98 LOC, `QACoverageBadge.tsx` = 142 LOC. All within ≤200 LOC limit. Constitution Rule 7 satisfied. Prior `[review]` task closed.
**Gate 3 (log-session.ts) — PASS (resolved):** All flagged branches now covered: `latestQaCoverageRefreshSignal('')` → null (early-return ✓); malformed JSON lines → null (catch branch ✓); `phase !== 'qa'` → null (phase filter ✓); QA `iteration_complete` → signal string ✓. `toSession({ project_root: '/home/user/my-project' }, ...)` → `projectName === 'my-project'` (IIFE ✓). Prior `[review]` task closed.

- **Gate 3 — FAIL (new):** `StatusIndicators.tsx` is a new module with no dedicated unit tests. Untested branches confirmed: (1) `PhaseBadge({ phase: '' })` early return — integration tests always render with a non-empty phase; (2) `phaseColors[phase.toLowerCase()] ?? 'bg-muted-foreground border-border'` fallback — no test passes an unknown phase string; (3) `formatSecs` in `ElapsedTimer` for `m > 0, s === 0` path (formats as `"Nm"` not `"Nm 0s"`) — integration tests do not control elapsed time precisely. Wrote `[review]` task.

- **Gate 3 — FAIL (new):** `QACoverageBadge.tsx` is a new module. `App.coverage.integration-qa.test.ts` covers the 50-79% yellow range (55%, 67%) and PASS/FAIL/UNTESTED feature statuses, but the following branches are untested: (1) green tone (`percentage >= 80`) — no test with `coverage_percent ≥ 80`; (2) red tone (`percentage < 50`) — no test with low coverage; (3) N/A/null state (`coverage === null` before fetch resolves, or `available: false`) — not exercised by any mock; (4) `parseQACoveragePayload` receiving a non-record primitive — the `!isRecord(payload)` guard is never triggered; (5) `percentValue` sourced from `payload.percentage` fallback (vs `coverage_percent`) — all mocks use `coverage_percent`. Wrote `[review]` task.

- **Gate 7 — FAIL (persists):** No browser/Playwright verification across any iteration. Container missing `libatk-1.0.so.0`. Spec acceptance criterion "Dashboard renders identically before and after refactor" remains unverified. `[review]` task remains open in TODO.md.

---

## Review — 2026-04-14 19:51 — commit cd3b32ed..c26c93e2

**Verdict: FAIL** (1 new finding → written to TODO.md as [review] task; 2 carried findings persist)
**Scope:** `src/components/layout/StatusIndicators.test.tsx` (new), `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

**Build summary:** Commit `009a6123` added `StatusIndicators.test.tsx` with 6 tests covering `PhaseBadge` (null return, fallback color, known phase) and `ElapsedTimer`/`formatSecs` (m=0, m>0+s=0, m>0+s>0). Commit `c26c93e2` is a QA re-test pass — 263/263 dashboard vitest pass; 16 pre-existing type errors in `orchestrate.ts`/`process-requests.ts` confirmed and tracked as `[qa/P1]`.

**Gate 1 — PASS:** Test file implements exactly what the `[review]` task specified. No spec deviations.
**Gate 2 — PASS:** All 6 tests use concrete value assertions — `container.firstChild` null check, `className.toContain('bg-yellow-500/20')`, `textContent === '2m'` — not existence or truthy checks.
**Gate 4 — PASS:** No dead code, unused imports, or TODO comments in test file.
**Gate 5 — PASS:** `vitest run` (dashboard) → 25 test files, 263 tests, all pass. 16 type-check errors and 33 broader test failures are pre-existing (last changed at commit eeba1148); not introduced by this work; tracked as `[qa/P1]` bugs.
**Gate 6 — PASS:** Test-only commit with no observable output; empty proof-manifest is the correct expected outcome.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 — FAIL (new):** The `[review]` task was scoped to 3 specific branches in `PhaseBadge`/`ElapsedTimer`, but the new-module ≥90% coverage requirement applies to the entire `StatusIndicators.tsx` module. `StatusDot` and `ConnectionIndicator` have zero tests. Uncovered branches: (1) `StatusDot`: `status === 'running'` animated pulse-dot vs static-dot branch; (2) `StatusDot`: `STATUS_DOT_CONFIG[status] ?? STATUS_DOT_CONFIG.unknown` fallback for unknown status; (3) `ConnectionIndicator`: connected/connecting/disconnected three-way switch for Icon, color, and label. Wrote `[review]` task.

- **Gate 3 (QACoverageBadge) — FAIL (persists):** Branch coverage tests for `QACoverageBadge.tsx` not yet written. `[review]` task remains open in TODO.md.

- **Gate 7 — FAIL (persists):** No browser/Playwright verification performed. `[review]` task deferred in TODO.md.

---

## Review — 2026-04-14 20:10 — commit 4555d233..70109c26

**Verdict: FAIL** (0 new findings; 1 prior finding resolved; 2 prior findings persist)
**Scope:** `src/components/layout/StatusIndicators.test.tsx` (modified — 6 new tests), `TODO.md`, `QA_COVERAGE.md`, `QA_LOG.md`

**Build summary:** Commit `ee910c72` added 6 tests to `StatusIndicators.test.tsx` covering all branches of `StatusDot` (running/stopped/unknown-fallback) and `ConnectionIndicator` (connected/connecting/disconnected). Commit `70109c26` is a QA re-test pass confirming 269/269 dashboard tests pass and QACoverageBadge tests still absent.

**Gate 1 — PASS:** Work directly addresses the prior `[review]` task. No spec deviations.
**Gate 2 — PASS:** All 6 new tests use concrete value assertions — `children.length === 2`, `className.toContain('animate-pulse-dot')`, `className.toContain('bg-muted-foreground/50')`, `className.toContain('bg-muted-foreground/30')`, `textContent === 'Live'`, `textContent === 'Connecting...'`, `textContent === 'Disconnected'`, `className.baseVal.toContain('text-green-500')`, `className.baseVal.toContain('animate-spin')`, `className.baseVal.toContain('text-red-500')`. No existence-only or truthy-only checks.
**Gate 4 — PASS:** No dead code, unused imports, or TODO comments in test file. TODO.md correctly marks the StatusDot/ConnectionIndicator `[review]` task `[x]`.
**Gate 5 — PASS:** Dashboard vitest → 25 test files, 269 tests, all pass. Dashboard `tsc --noEmit` → 0 errors. Pre-existing 33 failures and 16 type errors in non-dashboard suite are unchanged; tracked as `[qa/P1]`.
**Gate 6 — PASS:** Test-only commit with no observable output; empty proof is the correct expected outcome.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 (StatusIndicators) — PASS (resolved):** All flagged branches now covered: `StatusDot` running (2-child animated-pulse-dot structure asserted, line 76-80), stopped (bg-muted-foreground/50 asserted, zero children confirmed, line 90-91), unknown-fallback via `status='idle'` (bg-muted-foreground/30 asserted, line 100); `ConnectionIndicator` connected/connecting/disconnected (text labels and icon class names asserted). Prior `[review]` task closed.

- **Gate 3 (QACoverageBadge) — FAIL (persists):** No `QACoverageBadge.test.tsx` exists. Five untested branches remain (green tone ≥80%, red tone <50%, null/N/A state, `!isRecord` guard, `payload.percentage` fallback). Open `[review]` task in TODO.md "Up Next".

- **Gate 7 — FAIL (persists):** No browser/Playwright verification. Container missing `libatk-1.0.so.0`; `sudo apt-get` blocked by container security flags. `[review]` task deferred in TODO.md.

---

## Review — 2026-04-14 20:24 — commit 1531b3f5..b560857d

**Verdict: FAIL** (1 new finding → written to TODO.md as [review] task; 1 prior finding persists / deferred)
**Scope:** `src/components/layout/QACoverageBadge.test.tsx` (new), `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

**Build summary:** Commit `f0692311` added `QACoverageBadge.test.tsx` with 5 tests covering the 5 branches requested by the prior `[review]` task (green tone ≥80%, red tone <50%, N/A/available:false, `!isRecord` null input, `payload.percentage` fallback). Commit `b560857d` is a QA re-test pass confirming 274/274 dashboard tests pass.

**Gate 1 — PASS:** All 5 branches specified in the `[review]` task are implemented and tested exactly as requested. No spec deviations.
**Gate 2 — PASS:** All 5 tests use concrete value assertions — `className.toContain('text-green-700')`, `className.toContain('text-red-700')`, `className.toContain('bg-muted/40')`, `textContent.toContain('N/A')`, `textContent.toContain('75%')`, `className.toContain('text-yellow-700')`. No existence-only or truthy checks.
**Gate 4 — PASS:** No dead code, unused imports, or TODO comments. `mockFetch` helper DRY and correctly cleaned up via `vi.restoreAllMocks()`.
**Gate 5 — PASS:** Dashboard vitest → 26 test files, 274 tests, all pass. Pre-existing 33 non-dashboard failures and 16 type errors unchanged; tracked as `[qa/P1]`.
**Gate 6 — PASS:** Test-only commit with no observable output; empty proof-manifest is the correct expected outcome.
**Gate 8 — PASS:** No dependency changes.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 — FAIL (new):** The prior `[review]` task enumerated 5 specific badge-display branches — all now covered. However, the new-module ≥90% branch coverage rule applies to the entire `QACoverageBadge.tsx` (142 LOC). The expanded dropdown section (lines 106–137) has zero test coverage: `expanded=true` state (never triggered by a click), `ChevronDown` render branch (line 104), `features.length === 0` empty message (line 110), `feature.status === 'PASS'/'FAIL'/'UNTESTED'` statusTone ternary (lines 114–118), `StatusIcon` selection (line 119), and `feature.component &&` guard (line 125) are all untested. Estimated ≥9 uncovered branch points out of ~15 total. Coverage well below 90%. Note: fault lies with the prior review's underspecified task, not the builder. Wrote `[review]` task with 6 specific expansion-panel cases.

- **Gate 7 — FAIL (persists / deferred):** No Playwright/browser verification. Container missing `libatk-1.0.so.0`. `[review]` task deferred in TODO.md. Unchanged since prior review.

---
