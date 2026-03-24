# Review Log

## Review — 2026-03-24 — commits 1e86eafc..caf0739d

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/process-requests.ts`

### What was built

Two commits:
1. `1e86eafc` (orchestrate.ts): Add `needs_rebase?: boolean` to `OrchestratorIssue`; replace `review_feedback` with `needs_rebase = true` in `processPrLifecycle`; add branching in redispatch path to write `000-rebase-conflict.md` (agent: merge) vs `000-review-fixes.md` (agent: build) based on `needs_rebase`.
2. `234c68f0` (process-requests.ts): Extract `syncChildBranches` into testable function with injected deps; set `needs_redispatch = true` and `stateChanged = true` after writing the conflict queue file.

### Gate findings

- **Gate 2 FAIL**: `orchestrate.test.ts:2997` "requests rebase on first merge conflict" asserts `needs_redispatch === true` but NOT `needs_rebase === true`. The critical new mutation (`needs_rebase = true`) is not verified — a broken implementation that sets `needs_redispatch` but forgets `needs_rebase` passes the test.
- **Gate 2 FAIL**: The entire redispatch path (orchestrate.ts ~5615) has no tests. Both the `needs_rebase === true` branch (writes `000-rebase-conflict.md` with `agent: merge`) and the `else` branch (writes `000-review-fixes.md` with `agent: build`) are untested. This is the core behavior of the fix.
- **Gate 3 FAIL**: Follows from Gate 2 — 0% branch coverage on the `if (issue.needs_rebase === true)` conditional in `runOrchestratorScanPass`.
- **Gate 4 minor**: Dead JSDoc block + dangling comment at orchestrate.ts:3651-3655 referencing removed `requestRebase` function.
- **Gate 9 FAIL**: SPEC-ADDENDUM.md line 1434 documents the old `review_feedback`-based conflict dispatch; `needs_rebase` field is not documented.

### What passed

- Gate 1: Implementation matches the issue spec (TODO.md). `needs_rebase` flag correctly separates conflict from review-rejection redispatch. ✓
- Gate 2 (partial): `syncChildBranches` in process-requests.test.ts has thorough coverage — 5 tests covering failure/success/edge cases with concrete value assertions. ✓
- Gate 4 (partial): No dead code introduced in new logic; `syncChildBranches` extraction is clean. ✓
- Gate 5: Type check passes (0 errors). 9/9 process-requests tests pass. Zero new regressions (QA confirmed 25 pre-existing failures unchanged). ✓
- Gate 6: Purely internal logic change; no proof artifacts required. ✓
- Gates 7/8: N/A (no UI or dependency changes).

### Stale TODO items corrected

Tasks 1 and 2 in "Up Next" (Phase 2c test tasks) were marked as `[ ]` but ARE already implemented in `process-requests.test.ts` lines 27-70. Marked as `[x]` during this review.

### 4 [review] tasks written to TODO.md

---
