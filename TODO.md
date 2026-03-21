# Issue #136: Orchestrator must re-dispatch child or self-fix when review requests changes

## Current Phase: Hardening & Test Coverage

### In Progress

### Up Next
- [x] Add `needs_redispatch`, `review_feedback`, and `redispatch_count` to `OrchestratorIssue` interface (remove `as any` casts) — type safety for the re-dispatch fields that already exist in runtime
- [x] Add re-dispatch retry limit (max 3) — flag for human after N failed review cycles to prevent infinite re-dispatch loops. Use `redispatch_count` on the issue, increment in the scan pass step 3.5, and check before re-dispatching
- [ ] Add test: request-changes verdict sets `needs_redispatch` flag on issue state — unit test in `orchestrate.test.ts` for `processPrLifecycle` with `request-changes` verdict
- [ ] Add test: scan pass re-dispatches child when `needs_redispatch` is true — integration test for `runOrchestratorScanPass` with `dispatchDeps` verifying child re-launch and state transitions
- [ ] Add test: duplicate review comment prevention — verify `last_review_comment` prevents posting same comment twice
- [ ] Implement trivial self-fix for artifact removal — when review feedback is only about removing working artifacts (TODO.md, STEERING.md, etc.), the orchestrator should `git rm` + push directly instead of re-dispatching a full child loop

### Completed
- [x] Re-dispatch child loop on request-changes — `needs_redispatch` flag in PR lifecycle, picked up by scan pass step 3.5 (commit f9919e2)
- [x] Write review feedback as steering prompt to child queue — `000-review-fixes.md` with review summary (commit f9919e2)
- [x] Prevent duplicate review comments — `last_review_comment` comparison before posting (commit f9919e2)
- [x] Fix review result file path — check both `requestsDir` and `worktree/requests/` (commit d50c122)
- [x] Fallback verdict parsing from agent output artifacts (commit 1fdc923)
- [x] Review prompt includes absolute output path for verdict JSON (commit 7011ea0)
- [x] Review prompts sort first in queue with 000- prefix (commit 66de715)
