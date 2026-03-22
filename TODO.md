# Issue #134: PR review: inline code suggestions, threaded comments, builder resolves individually

## Current Phase: Implementation

### In Progress

- [ ] [review] Gate 1: `reviewPrDiff` (orchestrate.ts:3271) returns `verdict: 'pending'` on diff fetch error — change to `'flag-for-human'` and update summary to match test expectation `'Failed to fetch PR diff: ...'` (priority: high)
- [ ] [review] Gate 1: `checkPrGates` (orchestrate.ts:3203-3204) catch block sets `status: 'pass'` on mergeability API error — change to `status: 'fail'` so gate fails safe (priority: high)
- [ ] [review] Gate 1/4: `processPrLifecycle` (orchestrate.ts:3623) hardcodes `new GitHubAdapter(...)` instead of accepting adapter through `PrLifecycleDeps` — add an `adapter` or `createReview` dep to preserve pluggable adapter pattern (priority: high)
- [ ] [review] Gate 3: Create `adapter.test.ts` with direct unit tests for `GitHubAdapter.createReview()` and `GitHubAdapter.resolveThread()` — test API call structure, suggestion body formatting, empty comments array, and error cases (priority: high)
- [ ] [review] Gate 4: Redispatch steering (orchestrate.ts:5371) omits per-comment details from `pending_review_comments` — include comment IDs, file paths, and line numbers so the builder knows exactly which threads to address. Test at orchestrate.test.ts:4458 expects `Comment ID: 1234` (priority: high)
- [ ] [review] Gate 4: Remove no-op spread at orchestrate.ts:3618-3620 — `(reviewResult.comments ?? []).map(c => ({...c}))` adds no value since objects are not mutated downstream (priority: low)

### Up Next

- [x] **Extend `AgentReviewResult` to include inline comments** — Add an `inline_comments` array to the `AgentReviewResult` interface in `orchestrate.ts`. Each entry needs `path` (file), `line` (line number), `body` (comment text), and optional `suggestion` (replacement code). This is the foundational type that everything else depends on. (priority: critical)

- [x] **Add `createReview` and `resolveThread` to the adapter interface** — Extend `OrchestratorAdapter` in `adapter.ts` with `createReview(prNumber, opts: { body, event, comments[] })` and `resolveThread(prNumber, commentId)`. Implement in `GitHubAdapter` using `gh api repos/{owner}/{repo}/pulls/{pr}/reviews` (POST) for creating reviews with inline comments, and the GraphQL `minimizeComment` or thread resolution API for resolving. (priority: critical)

- [x] **Update review agent prompt to emit inline comments** — Modify `PROMPT_orch_review.md` to instruct the review agent to output structured inline comments in its verdict JSON. Each comment must specify the exact file path, line number (from the diff), comment body, and optional suggestion block using GH's ` ```suggestion\ncode\n``` ` syntax. The agent must cross-reference line numbers against the actual diff. (priority: critical)

- [x] **Replace `gh pr comment` with formal GH review API in orchestrator** — In `orchestrate.ts` `processPrLifecycle()` (~line 3674-3696), replace the single `gh pr comment` call with `adapter.createReview()` that posts a formal review with inline comments from the `AgentReviewResult`. The top-level review body should be a summary linking to all inline findings. Use review event `COMMENT` or `REQUEST_CHANGES` based on verdict. (priority: high)

- [ ] **Update builder STEERING.md to include per-comment IDs and resolution instructions** — Modify `buildFeedbackSteering()` in `gh.ts` to include review comment IDs alongside each feedback item, and add instructions telling the builder to: (1) address each comment individually, (2) commit with references like `fix: address review comment on file.ts:42`, and (3) call the resolve API per comment after fixing. (priority: high)

- [ ] **Add builder comment resolution capability** — Give the builder agent the ability to resolve individual review comment threads after addressing them. This means either: (a) adding a `resolveThread` call in the feedback loop (`checkAndApplyPrFeedback` in `gh.ts`) after the builder pushes fixes, or (b) providing the builder with a CLI command/queue mechanism to resolve threads. The builder should resolve each thread it addresses, not batch-resolve all at once. (priority: high)

- [ ] **Update `invokeAgentReview` in `process-requests.ts` to parse inline comments** — The review result parser (line ~536) currently extracts `verdict` and `summary` from the JSON file. Extend it to also parse the `inline_comments` array and pass it through to the orchestrator. Handle gracefully if the field is missing (backwards compat with old review agents). (priority: medium)

- [ ] **Add tests for inline review creation and thread resolution** — Add unit tests covering: (1) `AgentReviewResult` with inline comments, (2) `GitHubAdapter.createReview()` posting formal reviews, (3) `GitHubAdapter.resolveThread()`, (4) orchestrator using `createReview` instead of `gh pr comment`, (5) builder STEERING.md including comment IDs. Extend existing tests in `gh.test.ts`, `orchestrate.test.ts`, and `adapter.test.ts`. (priority: medium)

- [ ] [qa/P1] **reviewPrDiff returns `pending` instead of `flag-for-human` when diff fetch fails**: Ran `npm test` → test "flags for human when diff fetch fails" expects `flag-for-human` but gets `pending`. Spec says diff fetch errors should flag for human review, not silently remain pending. Tested at iter 1, commit b82c1e3. (priority: high)

- [ ] [qa/P1] **checkPrGates "handles gh errors gracefully for mergeability" returns `pass` instead of `fail`**: Ran `npm test` → test expects `fail` when gh returns errors for mergeability check, but gets `pass`. The PR gate should fail-safe when GitHub API errors occur, not pass silently. Tested at iter 1, commit b82c1e3. (priority: high)

### Completed
