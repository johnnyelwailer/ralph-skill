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

## Review — 2026-03-24 — commits f31b978a..da275c42

**Verdict: FAIL** (2 prior findings still unresolved — Gates 4 and 9; [review] tasks already in TODO.md)
**Scope:** `aloop/cli/src/commands/orchestrate.test.ts` (test additions only)

### What was built

Three commits since last review:
1. `009d8a11`: Add `needs_rebase === true` assertion to existing "requests rebase on first merge conflict" test in `orchestrate.test.ts:2999`.
2. `da275c42`: Add two new tests in `runOrchestratorScanPass` suite:
   - "writes 000-rebase-conflict.md with agent:merge and clears needs_rebase on redispatch when needs_rebase is true"
   - "writes 000-review-fixes.md with agent:build on redispatch when needs_rebase is false (regression guard)"
3. `c6abeff5`: QA session 2 updating `QA_COVERAGE.md` and `QA_LOG.md`.

### Gate findings

**Prior Gates 2/3 — RESOLVED ✓**
- Gate 2 finding 1 (`needs_rebase` assertion missing): RESOLVED. Line 2999 now asserts `(state.issues[0] as any).needs_rebase === true`. Concrete boolean equality check — a broken implementation would fail.
- Gate 2 finding 2 (redispatch path untested): RESOLVED. Two new tests cover the `if (issue.needs_rebase === true)` branch and the `else` branch with substantive assertions:
  - Rebase test: asserts file name (`000-rebase-conflict.md`), `agent: merge` in frontmatter, `PR #100` in body, `needs_rebase` cleared to `false`, `needs_redispatch` cleared to `false`.
  - Else test: asserts file name (`000-review-fixes.md`), `agent: build` in frontmatter, review feedback text present, `needs_redispatch` cleared, `review_feedback` cleared to `undefined`.
  - Both use real `mkdtemp` temp dirs (correct — `mkdir` in the SUT is real `node:fs/promises`).
- Gate 3 (0% branch coverage on conditional): RESOLVED by the two new tests above.

**Gate 4 — STILL OPEN ([ ] task in TODO.md)**
Dead JSDoc block + dangling comment at `orchestrate.ts:3651-3655` (`/** Request a child loop to rebase... */` + `// requestRebase is no longer used`) remains untouched. No build commit addressed this.

**Gate 9 — STILL OPEN ([ ] task in TODO.md)**
`SPEC-ADDENDUM.md:1434` still reads: *"the orchestrator sets `needs_redispatch = true` and `review_feedback` with rebase instructions"*. Implementation uses `needs_rebase = true`; spec is stale. No build commit addressed this.

### Test quality audit (Gate 2 deep read)

- `orchestrate.test.ts:2999` — `assert.ok((state.issues[0] as any).needs_rebase === true)`: Explicit boolean equality via `=== true`; equivalent to `assert.equal(x, true)`. Not shallow — a regression that skips setting `needs_rebase` would fail this. ✓
- `orchestrate.test.ts:4617` — `assert.ok(queueKey, ...)`: Existence check only. Acceptable since the file name is then confirmed by the search pattern `endsWith('000-rebase-conflict.md')`. ✓
- `orchestrate.test.ts:4618-4619` — `assert.match(content, /agent: merge/)` and `assert.match(content, /PR #100/)`: Concrete content assertions; wrong frontmatter or wrong PR number would fail. ✓
- `orchestrate.test.ts:4622-4623` — `assert.equal(needs_rebase, false)` and `assert.equal(needs_redispatch, false)`: Exact equality checks. ✓
- `orchestrate.test.ts:4647-4649` — `assert.match(content, /agent: build/)` and `assert.match(content, /Fix the type errors/)`: Concrete; review feedback is round-tripped from fixture to file content. ✓
- `orchestrate.test.ts:4652-4653` — `assert.equal(needs_redispatch, false)` and `assert.equal(review_feedback, undefined)`: Both exact. ✓

**Minor unresolved coverage gap (not a new finding — pre-existing):** The `if (feedback)` guard inside the `else` branch (`orchestrate.ts:5626`) — case where `needs_rebase=false` AND `review_feedback` is empty/undefined — is untested. No file is written in this case. This gap predates this build iteration and was not flagged in the prior review; noting for completeness but not adding a new [review] task.

### Gate 5 — PASS
- Type check: `tsc --noEmit` exits 0 (0 errors).
- Test suite: 998/1025 pass, 26 fail. All 26 failures are pre-existing (verified: same failures exist on `f31b978a`, the prior review commit). The two new tests pass (ok 20, ok 21).

### Gate 10 — PASS
QA session 2 verified all 5 Issue #163 features as PASS. `QA_COVERAGE.md` updated. No new P1 bugs filed.

### Gates 6/7/8 — N/A
Pure test additions; no proof artifacts, UI changes, or dependency updates.

### No new [review] tasks written
The two remaining open items (Gates 4/9) already have `[ ]` tasks in TODO.md. No duplicates added.

---
