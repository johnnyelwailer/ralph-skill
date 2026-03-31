# Review Log

## Review — 2026-03-31 — commits 8755afb71..bfc392e0a

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/AppView.tsx`, `src/hooks/useDashboardState.ts`, `src/lib/deriveProviderHealth.ts`, `src/lib/logHelpers.ts`, `src/lib/sessionHelpers.ts`, `src/components/shared/CommandPalette.tsx` (+ `.test.tsx`, `.stories.tsx`), `aloop/cli/dashboard/e2e/story-screenshots.spec.ts`, `src/test-setup.ts`

**Prior finding resolved:** Gate 5 — `story-screenshots.spec.ts` `qa-badge-default` story is now skipped with `test.skip()`. ✓

### Gate 1 (Spec Compliance) — FAIL
`useDashboardState.ts` is 312 LOC. SPEC-ADDENDUM §"Dashboard Component Architecture" states: "Files above 200 LOC should be split. Files above 300 LOC are a code smell." CONSTITUTION Rule 7: "Target < 150 LOC per file. If a file grows beyond that, split it." The hook should be split — SSE connection logic is self-contained and extractable.

### Gate 2 (Test Depth) — PASS
`CommandPalette.test.tsx` (8 tests): concrete value assertions throughout. Tests check exact text strings, exact function call arguments (`onStop(false)`, `onStop(true)`, `onSelectSession(null)`, `onSelectSession('s2')`), and interaction events (click, keyDown Escape). No shallow fakes detected. `deriveProviderHealth.test.tsx` updated to import from new lib path — tests are specific and concrete (11 tests covering empty, cooldown, recovery, multi-provider, malformed lines, configured providers).

### Gate 3 (Coverage) — FAIL
1. `useDashboardState.ts`: 312-line new module with ZERO test coverage — no `useDashboardState.test.ts` exists and the file is absent from `vitest.config.ts` coverage include list. This is the most complex new module (SSE reconnect with exponential backoff, 5 async action handlers, phase-change detection, budget derivation).
2. `AppView.tsx`: 60.46% branch coverage (threshold: 80%). Uncovered: `!isMobile` keyboard branch (line 54), touch gesture handlers `onTouchStart`/`onTouchEnd` (lines 58–60), mobile sidebar overlay (lines 72–78).
3. `logHelpers.ts` + `sessionHelpers.ts`: new lib modules, not in vitest coverage config — branch coverage untracked.

### Gate 4 (Code Quality) — PASS
No dead code, no unused imports, no commented-out code. `test-setup.ts` additions (`ResizeObserver`, `scrollIntoView` stubs) are necessary for cmdk compatibility and clean. The cross-package relative import `'../../../src/lib/parseTodoProgress'` in `useDashboardState.ts:8` is unconventional but correct (resolves to `aloop/cli/src/lib/parseTodoProgress.ts`) and mirrors the same pattern used by `App.coverage.*` tests.

### Gate 5 (Integration) — PASS
470 tests pass. `type-check` error in `Sidebar.test.tsx:240` (`afterEach` not found) is pre-existing — `Sidebar.test.tsx` was not touched in this build.

### Gate 6 (Proof) — PASS (marginal)
No `proof-manifest.json` found. Modified screenshots exist in `proof-artifacts/` (mainpanel-*, sessiondetail-* stories updated). For a pure refactoring with no visual changes, Storybook screenshots re-rendering identically is valid proof. CONSTITUTION: "purely internal … refactoring … skipping proof … is the expected correct outcome." Marginal pass.

### Gate 7 (Runtime Layout) — N/A
Pure refactoring — no CSS, layout components, or visual structure changed.

### Gate 8 (Version Compliance) — N/A
No dependency changes.

### Gate 9 (Documentation) — N/A
No user-facing behavior changed; no README/docs updates needed.

---
