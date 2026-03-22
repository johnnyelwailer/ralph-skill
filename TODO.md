# Issue #134: PR review: inline code suggestions, threaded comments, builder resolves individually

## Current Phase: Implementation

### In Progress

- [x] [review] Gate 3: Create `adapter.test.ts` with direct unit tests for `GitHubAdapter.createReview()` and `GitHubAdapter.resolveThread()` — test API call structure (POST to correct endpoint), suggestion body formatting (`\`\`\`suggestion` wrapping), empty comments array, and error cases. No adapter test file exists currently. (priority: high)
- [x] [review] Gate 4: Redispatch steering (orchestrate.ts:~5371) omits per-comment details from `pending_review_comments` — include comment IDs, file paths, and line numbers so the builder knows exactly which threads to address. Test at orchestrate.test.ts:~4502 expects `Comment ID: 1234` and `src/example.ts:10`. (priority: high)

### Up Next

- [x] **Update `buildFeedbackSteering()` in `gh.ts` to include review comment IDs** — `buildFeedbackSteering()` now includes `Comment ID: <id>` for each review item and explicit per-comment resolution guidance that references each ID. `gh.test.ts` assertions updated to verify comment ID and resolution instructions are present. (priority: high)

- [ ] **Add builder comment resolution capability** — Give the builder agent the ability to resolve individual review comment threads after addressing them. Options: (a) add `resolveThread` call in `checkAndApplyPrFeedback` in `gh.ts` after builder pushes fixes, or (b) provide a queue mechanism. The builder should resolve each thread individually, not batch-resolve. Depends on steering having comment IDs. (priority: high)

### Deferred

- [ ] [review] Gate 2: `adapter.test.ts:129-131` — bare `assert.rejects()` without predicate; any rejection passes (wrong error type, unrelated crash). Add predicate asserting `SyntaxError` or message containing `JSON` so a broken implementation that throws for a different reason would fail. (priority: low)
- [ ] [review] Gate 4: Remove no-op spread at orchestrate.ts:~3619 — `(reviewResult.comments ?? []).map(c => ({...c}))` adds no value since objects are not mutated downstream. Direct assignment suffices. (priority: low)

### Completed

- [x] [review] Gate 1: `reviewPrDiff` returns `'flag-for-human'` on diff fetch error [reviewed: fix verified in commit 02bd951]
- [x] [review] Gate 1: `checkPrGates` catch block fails safe on mergeability API error [reviewed: fix verified in commit 5f29e01]
- [x] [review] Gate 1/4: `processPrLifecycle` uses injected adapter via `deps.adapter` [reviewed: fix verified in commit 59b8999, new test at orchestrate.test.ts:3103]
- [x] **Extend `AgentReviewResult` to include inline comments** — `comments` array with `path`, `line`, `body`, `suggestion` fields exists on `AgentReviewResult` type. (priority: critical)
- [x] **Add `createReview` and `resolveThread` to the adapter interface** — `OrchestratorAdapter` interface in adapter.ts includes both methods. `GitHubAdapter` implements `createReview` via REST API POST to `/repos/{owner}/{repo}/pulls/{pr}/reviews` and `resolveThread` via GraphQL `minimizeComment` mutation. Types `ReviewComment`, `CreateReviewOpts`, `CreateReviewResult` defined. (priority: critical)
- [x] **Update review agent prompt to emit inline comments** — `PROMPT_orch_review.md` instructs the agent to output structured `comments` array in verdict JSON with `path`, `line`, `end_line`, `body`, and `suggestion` fields. (priority: critical)
- [x] **Replace `gh pr comment` with formal GH review API in orchestrator** — `processPrLifecycle()` now calls `adapter.createReview()` with `REQUEST_CHANGES` or `COMMENT` event based on verdict, posting a formal review with inline comments. Test at orchestrate.test.ts:3095 verifies the API call. (priority: high)
- [x] **`invokeAgentReview` in `process-requests.ts` parses inline comments** — `normalizeAgentReviewResult` (line ~598-618) already parses `raw.comments` array via `parseInlineReviewComment`, extracting `path`, `line`, `body`, `end_line`, `suggestion`. The field name is `comments` (matching the prompt), not `inline_comments`. Handles missing field gracefully. (priority: medium)
