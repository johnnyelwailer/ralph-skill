# Issue #134: PR review: inline code suggestions, threaded comments, builder resolves individually

## Current Phase: Implementation

### In Progress

- [x] Extend `AgentReviewResult` to include structured inline comments array (`{path, line, end_line?, body, suggestion?}`) in `orchestrate.ts:3104-3108`. The current type only has `summary: string` — no way to represent per-file, per-line feedback. (priority: critical, foundational)

- [x] Update review prompt `PROMPT_orch_review.md` to instruct the agent to return structured inline comments with file paths, line ranges, and suggestion blocks using GH suggestion syntax (` ```suggestion\nfixed code\n``` `). Currently the prompt only asks for a flat verdict JSON. (priority: critical, foundational)

- [x] Update `invokeAgentReview` in `process-requests.ts:285-340` to parse the new inline comments from the review result JSON. The current parser only reads `{pr_number, verdict, summary}`. Must also handle the fallback verdict parser (lines 300-324) gracefully when inline comments aren't present. (priority: critical)

- [ ] Replace `gh pr comment` in `processPrLifecycle` (`orchestrate.ts:3579-3588`) with `gh api repos/{owner}/{repo}/pulls/{pr}/reviews` to post a proper GH review with inline comments. Each inline comment should specify `path`, `line`, and `body` (with suggestion syntax). The top-level review body should be the summary linking all findings. (priority: critical)

- [ ] Update builder re-dispatch steering (`orchestrate.ts:5262-5266`) to pass individual review comments (not a flat summary blob) so the builder can address each one separately. Include comment IDs so the builder can resolve them after fixing. (priority: high)

- [ ] Add builder capability to resolve individual review comment threads via `gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}` (GraphQL `minimizeComment` or resolve conversation). The builder should resolve each thread after addressing it and commit with messages like `fix: address review comment on file.ts:42`. (priority: high)

- [ ] Update `buildFeedbackSteering` in `gh.ts:801-858` to format orchestrator-originated inline review comments distinctly from external human comments, preserving comment IDs for resolution tracking. (priority: medium)

### Up Next

- [ ] Add tests for the new inline review posting path — mock the `gh api` call and verify the review payload structure matches GitHub's expected format (`event: "REQUEST_CHANGES"`, `comments[]` with `path`/`line`/`body`). (priority: medium)

- [ ] Add tests for builder thread resolution — verify that after the builder addresses a comment, it calls the resolve API with the correct comment/thread ID. (priority: medium)

### Completed

_(none yet)_
