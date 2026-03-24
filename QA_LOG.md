# QA Log

## QA Session — 2026-03-24 (Issue #163)

### Test Environment
- Binary under test: No packaged install (vite unavailable for dashboard build); ran tests directly with `npx tsx --test`
- Tests run from: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-163-20260324-085120/worktree/aloop/cli`
- Commit under test: `35b6bd2c`
- Features tested: 3 (Phase 2c rebase fix, processPrLifecycle rebase path, test coverage gaps)

### Results
- PASS: Phase 2c syncChildBranches (needs_redispatch=true on rebase failure), processPrLifecycle first rebase attempt
- FAIL (pre-existing): "still dispatches rebase agent after multiple attempts", various processPrLifecycle/checkPrGates tests
- NEVER TESTED: redispatch path writing 000-rebase-conflict.md (no test exists yet)

### Key Observations

1. **Issue #163 core fix verified**: The 3 completed `[x]` tasks in TODO.md work correctly:
   - `needs_rebase?: boolean` field on OrchestratorIssue: type-check passes ✓
   - `processPrLifecycle`: sets `needs_rebase=true` and `needs_redispatch=true` on CONFLICTING — PASSES test ✓
   - Phase 2c: `needs_redispatch=true` written after merge agent queue — PASSES tests ✓

2. **No new regressions**: Orchestrate test suite had 25 failures before AND after Issue #163 changes (verified by checking out b03e1d64). Zero net new failures.

3. **Pre-existing failure of note**: "still dispatches rebase agent after multiple attempts" returns `gates_pending` instead of `rebase_requested` when `CONFLICTING` has no `mergeStateStatus`. This predates Issue #163.

4. **Missing test coverage** (outstanding TODO items):
   - `issue.needs_rebase === true` assertion not in "requests rebase on first merge conflict" test
   - No test for redispatch path with `needs_rebase=true` → 000-rebase-conflict.md
   - No test for redispatch path with `needs_rebase=false` → 000-review-fixes.md

### Bugs Filed
None — all findings are pre-existing or outstanding TODO items already tracked.

### Command Transcript

```
# Type check
cd aloop/cli && npm run type-check
# Exit code: 0 — no type errors

# Run all tests
npx tsx --test 'src/**/*.test.ts'
# tests 1038, pass 1010, fail 27, duration 104345ms

# Run orchestrate tests only
npx tsx --test 'src/commands/orchestrate.test.ts'
# tests 340, pass 315, fail 25

# Run process-requests tests
npx tsx --test 'src/commands/process-requests.test.ts'
# tests 9, pass 9, fail 0

# Run specific Issue #163 tests
npx tsx --test --test-name-pattern "requests rebase on first|still dispatches rebase" 'src/commands/orchestrate.test.ts'
# ok: "requests rebase on first merge conflict"
# not ok: "still dispatches rebase agent after multiple attempts" (actual: gates_pending, expected: rebase_requested)

# Verified pre-existing: checked out b03e1d64 (before Issue #163), same 25 failures
# Restored to HEAD: 35b6bd2c
```
