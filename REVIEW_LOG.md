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
