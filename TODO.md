# Issue #166: Review agent must read PR comment history and only re-review on new commits

## Current Phase: Verification

### In Progress
- [x] Add `TASK_SPEC.md` to `.gitignore` — acceptance criterion says sub-spec must be excluded from PR diffs, but it's missing from `.gitignore` (the review template rejects it as an artifact, but gitignore is the proper prevention)

### Completed
- [x] Track reviewed commit SHA — `last_reviewed_sha` stored on issue, SHA dedup check skips review when HEAD unchanged, SHA recorded after non-pending verdict, reset on redispatch (orchestrate.ts:4087-5847)
- [x] Include PR comment history in review prompt — `formatReviewCommentHistory()` formats comments with author/timestamp, fetched via `gh pr view --json comments`, appended with "do not repeat" instruction (process-requests.ts:89-704)
- [x] Conversation-aware delta verdicts — PROMPT_orch_review.md instructs agent to acknowledge fixes, flag remaining/new issues, use "fixed → remaining → new" summary format
- [x] Duplicate comment prevention — `last_review_comment` field prevents posting identical review feedback twice (orchestrate.ts:4126-4136)
- [x] Redispatch on request-changes — `needs_redispatch` flag triggers child loop re-launch with review feedback as steering prompt (orchestrate.ts:5817-5846)
- [x] TASK_SPEC.md seeded (not SPEC.md) — child loops receive `TASK_SPEC.md` from issue body, project `SPEC.md` preserved (orchestrate.ts:3398-3400)
- [x] Tests for SHA dedup — skip/proceed/store/no-store scenarios and redispatch SHA reset covered (orchestrate.test.ts)
- [x] Tests for formatReviewCommentHistory — empty/populated comment formatting (process-requests.test.ts:64+)
- [x] Tests for TASK_SPEC.md seeding — written/not-written scenarios (orchestrate.test.ts:2662-2677)
