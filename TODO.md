# Issue #134: PR review: inline code suggestions, threaded comments, builder resolves individually

## Current Phase: Implementation

### In Progress

### Up Next

- [x] **Orchestrator: preserve comment IDs across redispatch** — At orchestrate.ts:5479, `pending_review_comments` is cleared when the child is redispatched, losing comment IDs before the child completes. Add a new field `resolving_comment_ids: number[]` on the issue state that captures `pending_review_comments.map(c => c.id).filter(Boolean)` before clearing. This field persists until threads are resolved. (priority: high)

- [ ] **Orchestrator: call `resolveThread()` after redispatched child completes** — In `monitorChildren()` (orchestrate.ts:4334), when a child in state `'exited'` has `resolving_comment_ids` on its issue, iterate over those IDs and call `adapter.resolveThread(prNumber, commentId)` for each one individually (not batch). Clear `resolving_comment_ids` after resolution. Add error handling per-comment (best-effort — log failures but don't block PR creation). Requires adapter access in `monitorChildren` deps. (priority: high)

- [ ] **`gh watch`: call `resolveThread()` after builder re-iteration completes** — In `checkAndApplyPrFeedback` (gh.ts:886), the `processed_comment_ids` already tracks which comments were steered on. After the builder loop completes (detected in next poll cycle when `entry.status === 'completed'`), resolve those comment threads. Add a `resolving_comment_ids` field to `GhWatchIssueEntry`, populated from `feedback.new_comments` IDs before resume. On next completed poll, call `resolveThread()` for each. (priority: high)

- [ ] **Add tests for thread resolution in orchestrator** — In `orchestrate.test.ts`, add test: when a redispatched child exits, `adapter.resolveThread()` is called for each comment ID from the previous review. Verify individual calls (not batch), verify best-effort error handling (one failure doesn't block others), and verify `resolving_comment_ids` is cleared after. (priority: high)

- [ ] **Add tests for thread resolution in `gh watch`** — In `gh.test.ts`, add test: after builder re-iteration completes, `resolveThread()` is called for each steered-on comment. Mock the adapter and verify per-comment resolution calls. (priority: high)

### Deferred

- [ ] [review] Gate 2: `adapter.test.ts:129-131` — bare `assert.rejects()` without predicate; any rejection passes (wrong error type, unrelated crash). Add predicate asserting `SyntaxError` or message containing `JSON` so a broken implementation that throws for a different reason would fail. (priority: low)
- [ ] [review] Gate 4: Remove no-op spread at orchestrate.ts:~3619 — `(reviewResult.comments ?? []).map(c => ({...c}))` adds no value since objects are not mutated downstream. Direct assignment suffices. (priority: low)

### Completed

- [x] [review] Gate 3: Create `adapter.test.ts` with direct unit tests for `GitHubAdapter.createReview()` and `GitHubAdapter.resolveThread()` — test API call structure, suggestion body formatting, empty comments array, and error cases. (priority: high)
- [x] [review] Gate 4: Redispatch steering includes per-comment details (comment IDs, file paths, line numbers) so the builder knows which threads to address. (priority: high)
- [x] **Update `buildFeedbackSteering()` in `gh.ts` to include review comment IDs** — includes `Comment ID: <id>` for each review item and explicit per-comment resolution guidance. (priority: high)
- [x] [review] Gate 1: `reviewPrDiff` returns `'flag-for-human'` on diff fetch error [reviewed: fix verified in commit 02bd951]
- [x] [review] Gate 1: `checkPrGates` catch block fails safe on mergeability API error [reviewed: fix verified in commit 5f29e01]
- [x] [review] Gate 1/4: `processPrLifecycle` uses injected adapter via `deps.adapter` [reviewed: fix verified in commit 59b8999, new test at orchestrate.test.ts:3103]
- [x] **Extend `AgentReviewResult` to include inline comments** — `comments` array with `path`, `line`, `body`, `suggestion` fields exists on `AgentReviewResult` type. (priority: critical)
- [x] **Add `createReview` and `resolveThread` to the adapter interface** — `OrchestratorAdapter` interface in adapter.ts includes both methods. `GitHubAdapter` implements `createReview` via REST API POST to `/repos/{owner}/{repo}/pulls/{pr}/reviews` and `resolveThread` via GraphQL `minimizeComment` mutation. Types `ReviewComment`, `CreateReviewOpts`, `CreateReviewResult` defined. (priority: critical)
- [x] **Update review agent prompt to emit inline comments** — `PROMPT_orch_review.md` instructs the agent to output structured `comments` array in verdict JSON with `path`, `line`, `end_line`, `body`, and `suggestion` fields. (priority: critical)
- [x] **Replace `gh pr comment` with formal GH review API in orchestrator** — `processPrLifecycle()` now calls `adapter.createReview()` with `REQUEST_CHANGES` or `COMMENT` event based on verdict, posting a formal review with inline comments. Test at orchestrate.test.ts:3095 verifies the API call. (priority: high)
- [x] **`invokeAgentReview` in `process-requests.ts` parses inline comments** — `normalizeAgentReviewResult` (line ~598-618) already parses `raw.comments` array via `parseInlineReviewComment`, extracting `path`, `line`, `body`, `end_line`, `suggestion`. The field name is `comments` (matching the prompt), not `inline_comments`. Handles missing field gracefully. (priority: medium)
