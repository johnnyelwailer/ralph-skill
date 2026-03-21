# Issue #136: Orchestrator must re-dispatch child or self-fix when review requests changes

## Current Phase: Hardening & Test Coverage

### In Progress

### Up Next
- [x] Add test: duplicate review comment prevention — verify `last_review_comment` prevents posting same comment twice in `processPrLifecycle` (two tests at orchestrate.test.ts: skip when same, post when different)
- [x] Implement trivial self-fix for artifact removal — when review feedback is only about removing working artifacts (TODO.md, STEERING.md, etc.), the orchestrator should `git rm` + push directly instead of re-dispatching a full child loop

### Completed
- [x] Add `needs_redispatch`, `review_feedback`, and `redispatch_count` to `OrchestratorIssue` interface (remove `as any` casts) — commit dfe0c07
- [x] Add re-dispatch retry limit (max 3) — flag for human after N failed review cycles (commit 09d5716)
- [x] Add test: request-changes verdict sets `needs_redispatch` flag on issue state — unit test at orchestrate.test.ts:3008 (commit b370197)
- [x] Add test: scan pass re-dispatches child when `needs_redispatch` is true — tests at orchestrate.test.ts:4468 and :4510 covering re-dispatch + retry limit (commit b370197)
- [x] Re-dispatch child loop on request-changes — `needs_redispatch` flag in PR lifecycle, picked up by scan pass step 3.5 (commit f9919e2)
- [x] Write review feedback as steering prompt to child queue — `000-review-fixes.md` with review summary (commit f9919e2)
- [x] Prevent duplicate review comments — `last_review_comment` comparison before posting (commit f9919e2)
- [x] Fix review result file path — check both `requestsDir` and `worktree/requests/` (commit d50c122)
- [x] Fallback verdict parsing from agent output artifacts (commit 1fdc923)
- [x] Review prompt includes absolute output path for verdict JSON (commit 7011ea0)
- [x] Review prompts sort first in queue with 000- prefix (commit 66de715)
