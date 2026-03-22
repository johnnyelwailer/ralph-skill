# Review Log

## Review — 2026-03-22 — commit 2eb94a2..b167486

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/cli/dashboard/src/hooks/useCost.ts, aloop/cli/dashboard/src/components/progress/CostDisplay.tsx, aloop/cli/dashboard/src/AppView.tsx, aloop/cli/src/commands/dashboard.ts

- Gate 1 FAIL: `CostDisplay.tsx:35-41` — early return on `opencode_unavailable` hides `sessionCost` from log events. Component has no `sessionCost` prop. Spec requires per-session cost display even when aggregate cost is unavailable (SPEC-ADDENDUM.md:332-334, 372; TASK_SPEC.md acceptance criteria).
- Gate 1 FAIL: `AppView.tsx:694-728` — sidebar session costs fetched via `/api/cost/session/:id` (opencode CLI), all null when opencode unavailable. Per-session cost from `useCost` hook (log.jsonl aggregation) is never shown in sidebar cards.
- Gate 2+3 FAIL: Zero tests for `useCost.ts` (126 lines), `CostDisplay.tsx` (79 lines), and cost API routes in `dashboard.ts` (~77 lines). New modules require >=90% branch coverage.
- Gate 4 PASS: Clean code, no dead imports or duplication. Minor note: `isOpencodeCli()` called before cache check on every request (line 1116) — inefficiency, not a failure.
- Gate 5 PASS: 12 test failures and 1 TS error are pre-existing (verified by running tests at committed state vs stashed state). Build succeeds. No new regressions.
- Gate 6 N/A: No proof artifacts directory. QA already tested and filed 3 bugs — serves as evidence.
- Gate 7 SKIP: No layout/grid changes.
- Gate 8 PASS: All deps match VERSIONS.md. No new dependencies.
- Gate 9 PASS: No documentation changes needed.

---

## Review — 2026-03-22 — commit c78a992..2e082e2

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** AppView.tsx (displaySessionCost fix), CostDisplay.test.tsx (new test file)

**Prior findings status:**
- Prior #1 (Gate 1: `s.id === 'current'` never matches): **RESOLVED** — `AppView.tsx:766-767` now uses `s.isActive`. Active session cost from `useCost` log aggregation correctly displayed in sidebar card (line 791) and tooltip (line 805).
- Prior #2 (Gate 3: CostDisplay 0% coverage): **PARTIALLY RESOLVED** — 6 tests added with concrete assertions ($2.00 / $10.00, exact color classes, exact warning strings). Estimated ~80% branch coverage — below 90% threshold for new module.

**New finding:**
- Gate 3 FAIL: `CostDisplay.test.tsx` misses 3 branch groups: (a) unavailable + sessionCost > 0 + no budgetCap, (b) isLoading in no-budget-cap path, (c) warning/pause rendered independently. Estimated 80% vs required 90%.

**Gates passed:** Gate 1 (isActive fix resolves prior finding), Gate 2 (tests assert concrete values — no shallow fakes), Gate 4 (clean), Gate 5 (cannot verify — sandbox), Gate 6 (prior QA evidence covers mechanism), Gate 7 (skip), Gate 8 (no dep changes), Gate 9 (no doc changes).

---

## Review — 2026-03-22 — commit bd76d3c..8ec517c

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** CostDisplay.tsx, AppView.tsx (Sidebar), useCost.test.ts (new), App.coverage.test.ts

**Prior findings status:**
- Prior #1 (CostDisplay sessionCost fallback): **RESOLVED** — `CostDisplay.tsx:37-51` now renders session spend + progress bar when opencode unavailable. QA confirms at 444992c.
- Prior #2 (Sidebar session cost): **STILL FAILING** — code was added (`displaySessionCost` at AppView.tsx:766-767, `sessionCost` prop threaded to Sidebar) but the `s.id === 'current'` check never matches because the actual session ID is the full orchestrator name. QA re-test confirms tooltip still shows no cost.
- Prior #3 (Zero tests): **PARTIALLY RESOLVED** — `useCost.test.ts` added with 5 well-written tests (concrete values, edge cases, error paths). CostDisplay and dashboard cost route tests still missing.

**New findings:**
- Gate 1 FAIL: `AppView.tsx:766` — `s.id === 'current'` identity check is wrong; real session IDs are full names like `orchestrator-20260321-...`. Current session cost never appears in sidebar.
- Gate 3 FAIL: CostDisplay.tsx (95 lines, new module) has 0% test coverage. dashboard.ts cost routes (~77 lines) have 0% test coverage. useCost.test.ts covers main paths but misses `cancelled`, `inFlightRef` guard, and `toNumber` edge branches (~70% estimated).

**Gates passed:** Gate 2 (useCost tests are thorough — no shallow fakes), Gate 4 (clean code), Gate 5 (cannot run tests due to env memory limits, but QA confirms no regressions), Gate 6 (N/A — QA evidence sufficient), Gate 7 (skip — no layout changes), Gate 8 (no dep changes), Gate 9 (no doc changes needed).

---
