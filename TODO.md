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

### Spec-Gap Analysis (2026-03-22)

spec-gap analysis: no discrepancies found — spec fully fulfilled

**Details:** Cross-referenced SPEC.md acceptance criteria against the issue #166 implementation. All P1/P2 requirements are met:

- **Orchestrator review** (SPEC.md:2215): `approve`, `request-changes`, `flag-for-human` verdicts — implemented in `PROMPT_orch_review.md` and `process-requests.ts`
- **Rejected PRs → feedback to child** (SPEC.md:2217): `needs_redispatch` + `review_feedback` → child re-launched with steering — implemented in `orchestrate.ts:5817-5846`
- **PR feedback loop** (SPEC.md:2375): comment history fetched via `gh pr view --json comments`, formatted by `formatReviewCommentHistory()`, injected into review prompt — implemented in `process-requests.ts:89-704`
- **Sub-spec seeding** (SPEC.md:1301,1577): child reads sub-spec from issue body seeded as `TASK_SPEC.md` — implemented in `orchestrate.ts:3398-3400`, excluded via `.gitignore`
- **Config consistency**: `config.yml` providers/models match `loop.sh` and `loop.ps1` defaults; round-robin order consistent across all three files
- **Template consistency**: all prompt frontmatter `provider:` values reference valid providers; no orphan or missing templates
- **TODO hygiene**: all items marked `[x]`, none reference removed code or hallucinated features

P3 notes (cosmetic, not blocking): SPEC.md could document the `TASK_SPEC.md` filename convention and SHA-based review dedup optimization, but these are implementation details consistent with the spec's intent.

# Issue #144: Daemon lifecycle

- [ ] [qa/P2] README resume example uses wrong flags: README line 33 says `aloop start --launch-mode resume --session-dir ~/.aloop/sessions/<id>` → CLI returns `error: unknown option '--launch-mode'` → Should be `aloop start --launch resume <session-id>` (no --session-dir flag, session-id is positional). Tested at iter 20. (priority: high)
