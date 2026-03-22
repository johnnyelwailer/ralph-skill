# Issue #134: PR review: inline code suggestions, threaded comments, builder resolves individually

## Current Phase: Implementation

### In Progress

- [x] [review] Gate 1: `reviewPrDiff` (orchestrate.ts:3273) returns `verdict: 'pending'` on diff fetch error — change to `'flag-for-human'` and update summary prefix to `'Failed to fetch PR diff: ...'` to match test at orchestrate.test.ts:2860. One-line fix in catch block. (priority: high)
- [ ] [review] Gate 1: `checkPrGates` (orchestrate.ts:3204) catch block sets `status: 'pass'` on mergeability API error — change to `status: 'fail'` and set `mergeable: false` so gate fails safe. Test at orchestrate.test.ts:2798 expects `fail`. One-line fix. (priority: high)
- [ ] [review] Gate 1/4: `processPrLifecycle` (orchestrate.ts:3623) hardcodes `new GitHubAdapter(...)` instead of accepting adapter through `PrLifecycleDeps` — add an `adapter` field to `PrLifecycleDeps` interface so callers can inject a test double. Currently prevents unit testing review creation in isolation. (priority: high)
- [ ] [review] Gate 3: Create `adapter.test.ts` with direct unit tests for `GitHubAdapter.createReview()` and `GitHubAdapter.resolveThread()` — test API call structure (POST to correct endpoint), suggestion body formatting (`\`\`\`suggestion` wrapping), empty comments array, and error cases. No adapter test file exists currently. (priority: high)
- [ ] [review] Gate 4: Redispatch steering (orchestrate.ts:~5371) omits per-comment details from `pending_review_comments` — include comment IDs, file paths, and line numbers so the builder knows exactly which threads to address. Test at orchestrate.test.ts:4458 expects `Comment ID: 1234`. (priority: high)

### Up Next

- [ ] **Update `buildFeedbackSteering()` in `gh.ts` to include review comment IDs** — Currently formats reviewer comments with path/line/body but omits `comment.id`. Add comment IDs alongside each feedback item and include instructions for the builder to address each individually and reference the ID when resolving. Test in gh.test.ts:2089 should be extended to assert ID presence. (priority: high)

- [ ] **Add builder comment resolution capability** — Give the builder agent the ability to resolve individual review comment threads after addressing them. Options: (a) add `resolveThread` call in `checkAndApplyPrFeedback` in `gh.ts` after builder pushes fixes, or (b) provide a queue mechanism. The builder should resolve each thread individually, not batch-resolve. Depends on steering having comment IDs. (priority: high)

- [ ] [review] Gate 4: Remove no-op spread at orchestrate.ts:3618-3620 — `(reviewResult.comments ?? []).map(c => ({...c}))` adds no value since objects are not mutated downstream. Direct assignment suffices. (priority: low)

### Completed

- [x] **Extend `AgentReviewResult` to include inline comments** — `comments` array with `path`, `line`, `body`, `suggestion` fields exists on `AgentReviewResult` type. (priority: critical)

- [x] **Add `createReview` and `resolveThread` to the adapter interface** — `OrchestratorAdapter` interface in adapter.ts includes both methods. `GitHubAdapter` implements `createReview` via REST API POST to `/repos/{owner}/{repo}/pulls/{pr}/reviews` and `resolveThread` via GraphQL `minimizeComment` mutation. Types `ReviewComment`, `CreateReviewOpts`, `CreateReviewResult` defined. (priority: critical)

- [x] **Update review agent prompt to emit inline comments** — `PROMPT_orch_review.md` instructs the agent to output structured `comments` array in verdict JSON with `path`, `line`, `end_line`, `body`, and `suggestion` fields. (priority: critical)

- [x] **Replace `gh pr comment` with formal GH review API in orchestrator** — `processPrLifecycle()` now calls `adapter.createReview()` with `REQUEST_CHANGES` or `COMMENT` event based on verdict, posting a formal review with inline comments. Test at orchestrate.test.ts:3095 verifies the API call. (priority: high)

- [x] **`invokeAgentReview` in `process-requests.ts` parses inline comments** — `normalizeAgentReviewResult` (line ~598-618) already parses `raw.comments` array via `parseInlineReviewComment`, extracting `path`, `line`, `body`, `end_line`, `suggestion`. The field name is `comments` (matching the prompt), not `inline_comments`. Handles missing field gracefully. (priority: medium)
