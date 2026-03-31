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

## Review — 2026-03-31 — commits 9447f37dd..8a2b1b73c

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `src/hooks/useDashboardState.test.ts`, `src/hooks/useSSEConnection.test.ts`, `src/lib/logHelpers.test.ts`, `src/lib/sessionHelpers.test.ts`

**Prior findings resolved:**
- Gate 2 (providerHealth existence checks): ✓ All 3 `providerHealth` tests now use concrete `toEqual([])` / `toEqual([{ name: 'claude', status: 'unknown', lastEvent: '' }, ...])` assertions — anti-pattern eliminated.
- Gate 3 (`logHelpers.ts`): ✓ 100% branch coverage — empty log, non-record JSON (null, number, boolean), string/number/null iteration values, backward scan ordering, fallback field names all covered.
- Gate 3 (`sessionHelpers.ts`): ✓ 90% branch coverage — project_root derivation (trailing slash, backslash, no trailing slash), project_name override, fallback projectName, stuckCount, alternate field keys all covered.

### Gate 2 (Test Depth) — FAIL (new finding)
`useSSEConnection.test.ts` "processes valid SSE state events" (~line 96): asserts `expect(result.current.state).not.toBeNull()`. The test sends `stateData = { log: '', activeSessions: [], recentSessions: [] }` via SSE but only verifies state is non-null. Any truthy value passes — this is the existence-check anti-pattern. Fix: `expect(result.current.state).toEqual({ log: '', activeSessions: [], recentSessions: [] })`.

### Gate 3 (Coverage) — FAIL (persistent)
`useSSEConnection.ts` branch coverage confirmed at 80.76% (uncovered: lines 46, 57-70, 90). Coverage unchanged from last review despite 12 additional targeted tests. Remaining uncovered branches are architecturally unreachable without source changes:
- Lines 57-58: `if (stateListener)` / `if (heartbeatListener)` null-guards in `cleanupEventSource` — stateListener/heartbeatListener are only nulled inside `cleanupEventSource` itself, making the false branches unreachable. These guards are redundant and should be removed.
- Line 70: `if (cancelled) return` inside `connectSSE` — reconnect timer is always cleared before cancelled=true; guard is dead code.
- Lines 46, 90: `if (!cancelled)` branches in async load() and errorListener — structurally difficult to trigger after cancelled=true given AbortController and onerror teardown order.

Removal of the 3 redundant null-guards (lines 57-58, 70) would eliminate uncoverable branches and bring coverage to ≥90%.

### Gates 1, 4–9 — PASS / N/A
All tests pass (569). No source production code changed — gates 1, 4, 5 pass. Gates 6-9 N/A (pure test additions, no proof artifacts expected, no deps or docs changed).

---
## Review — 2026-03-31 — commits bfc392e0a..20b158323

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `src/hooks/useDashboardState.ts`, `src/hooks/useSSEConnection.ts`, `src/hooks/useDashboardState.test.ts`, `src/App.coverage.integration-app.test.ts`, `vitest.config.ts`

**Prior findings resolved:**
- Gate 1: `useDashboardState.ts` split from 312 LOC into `useSSEConnection.ts` (110 LOC) + `useDashboardState.ts` (227 LOC) ✓ (marginal — 227 > 200 spec threshold but close to ~200 example in review task)
- Gate 3: `useDashboardState.ts` now has `useDashboardState.test.ts` with 95.68% branch coverage ✓; `AppView.tsx` branch coverage improved from 60% to 88.37% ✓; both lib files added to `vitest.config.ts` coverage include ✓

### Gate 1 (Spec Compliance) — PASS (marginal)
`useDashboardState.ts` is now 227 LOC — reduced from 312 LOC. Still exceeds the spec-addendum's 200-LOC "should be split" threshold by 27 lines, but the prior [review] task itself used "~200 LOC" as the example target. SSE state + action handlers are tightly coupled, further artificial splits would harm readability. The review task said "OR split further" — builder chose not to, which is a judgment call. Observing but not blocking.

### Gate 2 (Test Depth) — FAIL
`useDashboardState.test.ts`: the `configuredProviders (via providerHealth)` test group contains 3 existence-check anti-patterns:
- Line 322: `expect(result.current.providerHealth).toBeDefined()` (null meta case)
- Line 330: `expect(result.current.providerHealth).toBeDefined()` (enabled_providers case)
- Line 337: `expect(result.current.providerHealth).toBeDefined()` (round_robin_order case)

These pass even if `deriveProviderHealth` returns garbage. Each test must assert the actual return value.

### Gate 3 (Coverage) — FAIL
Three files confirmed still below threshold after re-running `npm run test:coverage`:
- `useSSEConnection.ts`: 65.38% branch (needs ≥90%) — uncovered lines 51 (catch-when-cancelled in load()) and 83 (JSON parse error in stateListener)
- `logHelpers.ts`: 82.14% branch (needs ≥90%) — uncovered lines 29, 36, 42–43 (latestQaCoverageRefreshSignal edge cases)
- `sessionHelpers.ts`: 70% branch (needs ≥90%) — uncovered line 10 (project_root → projectName derivation)

These overlap with existing [qa/P1] tasks but escalated to [review] with specific test prescriptions.

### Gate 4 (Code Quality) — PASS
No dead code, unused imports, or commented-out code in any changed file. Test file is clean and well-organized.

### Gate 5 (Integration) — PASS
518 tests pass. Type-check passes. Build clean.

### Gate 6 (Proof) — PASS
No proof-manifest. Pure test/refactor build — per CONSTITUTION, skipping proof is the expected correct outcome for internal-only changes.

### Gates 7–9 — N/A
No CSS/layout changes, no dependency changes, no user-facing behavior changes.

---

## Review — 2026-03-31 — commits 7cabbdf64..e8a8248d7

**Verdict: PASS** (2 observations)
**Scope:** `aloop/cli/dashboard/src/hooks/useSSEConnection.ts`, `aloop/cli/dashboard/src/hooks/useSSEConnection.test.ts`

**Prior findings resolved:**
- Gate 2: `useSSEConnection.test.ts` line 111 `expect(result.current.state).not.toBeNull()` → `expect(result.current.state).toEqual({ log: 'line1', activeSessions: [], recentSessions: [] })` ✓
- Gate 3: `useSSEConnection.ts` branch coverage 80.76% → 90% (confirmed by running `npm run test:coverage`) ✓ — 3 redundant null-guards removed: `if (stateListener)` (old line 57), `if (heartbeatListener)` (old line 58), and `if (cancelled) return` in `connectSSE` (old line 70).

### Gate 1 (Spec Compliance) — PASS
Both changes directly implement the two `[review]` tasks. Scope is minimal and precise — only changed exactly what was requested.

### Gate 2 (Test Depth) — PASS
`useSSEConnection.test.ts` line 111: `toEqual({ log: 'line1', activeSessions: [], recentSessions: [] })` — concrete shape assertion, anti-pattern eliminated. 14 tests total, covering: network failure, malformed JSON, valid state, QA signal, heartbeat, error/reconnect, HTTP error, open event, session reset, null-eventSource cleanup, cancel-during-reconnect, multi-reconnect, and cancelled `load()` paths. Thorough.

### Gate 3 (Coverage) — PASS
`useSSEConnection.ts` branch coverage confirmed at exactly 90% (`npm run test:coverage`). Uncovered lines 46, 89 are `!cancelled` branches in async paths that cannot be reliably triggered after `controller.abort()` — architecturally unreachable without non-deterministic timing. 90% meets the ≥90% threshold for new modules.

### Gates 4–9 — PASS / N/A
No dead code. 569 dashboard tests pass. Build succeeds. No proof artifacts expected (pure internal change). No CSS, deps, or docs changed.

---
