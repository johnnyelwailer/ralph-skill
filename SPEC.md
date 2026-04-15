# Issue #71: Review agent Gate 10: QA coverage trend and bug fix rate

## Objective
Add Gate 10 to the review-agent instruction template so review decisions include QA coverage percentage, QA bug-fix velocity, and coverage trend from `QA_COVERAGE.md` and `QA_LOG.md`, as required by `SPEC-ADDENDUM.md` section D.

## Context
The review agent currently defines 9 gates in `aloop/templates/instructions/review.md`. `SPEC-ADDENDUM.md` adds a required Gate 10 focused on QA trend and stale QA bug handling, and all gate-count wording must be aligned to 10 gates.

## Architectural Context
- Review behavior is prompt-defined: `aloop/templates/instructions/review.md` is the source of truth for gate logic.
- `aloop/templates/PROMPT_review.md` is a thin wrapper that includes `instructions/review.md` via `{{include:instructions/review.md}}`.
- Gate 10 consumes QA artifacts produced by the QA agent (`QA_COVERAGE.md`, `QA_LOG.md`) and influences review PASS/FAIL output only.
- This issue is a prompt-contract update, not a runtime/orchestrator code-path change.

## Scope
In scope for modification:
- `aloop/templates/instructions/review.md` (primary):
  - Add `### Gate 10: QA Coverage & Bug Fix Rate` immediately after Gate 9.
  - Add explicit logic:
    1. Read `QA_COVERAGE.md`; compute coverage percentage as `(PASS + FAIL) / total features`.
    2. If coverage `< 30%`, FAIL with: `QA coverage critically low, prioritize QA iterations`.
    3. Read `QA_LOG.md`; determine whether bugs from prior iterations are being fixed.
    4. If any `[qa/P1]` bug is outstanding for `>3` iterations, FAIL with: `Stale QA bugs not addressed`.
    5. Require a trend statement indicating whether coverage is growing or shrinking.
  - Update all gate-count references from 9 to 10 across objective/process/heading/approval text.
- `aloop/templates/PROMPT_review.md` (verification-only unless broken include/frontmatter):
  - Confirm it still correctly includes `instructions/review.md`.

## Out of Scope
Do NOT modify:
- `aloop/templates/instructions/qa.md`, finalizer prompts, or dashboard prompts/code (separate spec items; Constitution Rule 12).
- `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` (loop runners remain dumb; Constitution Rule 1).
- Runtime/orchestrator implementation under `aloop/cli/src/**` (runtime/loop separation; Constitution Rule 2), unless an explicit follow-up issue is created.
- `SPEC.md`, `SPEC-ADDENDUM.md`, or `CONSTITUTION.md` content (this issue implements existing spec text only).

## Constraints
- Preserve existing Gate 1-9 semantics; only add Gate 10 and update gate-count wording.
- Keep changes tightly scoped to review prompt templates (Constitution Rules 12, 18, 19).
- Use the spec-defined thresholds and wording for failure conditions (coverage `<30%`, stale `[qa/P1]` `>3` iterations).
- Keep prompt behavior data-driven from QA artifacts; do not introduce unrelated hardcoded policy outside this issue's required constants (Constitution Rule 15).

## Deliverables
- Updated `aloop/templates/instructions/review.md` with Gate 10 logic and 10-gate terminology.
- Verified `aloop/templates/PROMPT_review.md` include/frontmatter remains correct (update only if incorrect).

## Acceptance Criteria
- [ ] `aloop/templates/instructions/review.md` contains `### Gate 10: QA Coverage & Bug Fix Rate` and it appears after `### Gate 9: Documentation Freshness`.
- [ ] Gate 10 text explicitly defines coverage as `(PASS + FAIL) / total features` sourced from `QA_COVERAGE.md`.
- [ ] Gate 10 includes: `If coverage < 30%: FAIL — "QA coverage critically low, prioritize QA iterations"`.
- [ ] Gate 10 includes: `If [qa/P1] bugs outstanding for >3 iterations: FAIL — "Stale QA bugs not addressed"` based on `QA_LOG.md`.
- [ ] Gate 10 requires coverage trend tracking (growing vs shrinking).
- [ ] All review gate-count references in `aloop/templates/instructions/review.md` are updated to 10, including:
  - `9 quality gates` -> `10 quality gates`
  - `the 9 gates below` -> `the 10 gates below`
  - `## The 9 Gates` -> `## The 10 Gates`
  - `[reviewed: gates 1-9 pass]` -> `[reviewed: gates 1-10 pass]`
  - `chore(review): PASS — gates 1-9 pass` -> `chore(review): PASS — gates 1-10 pass`
- [ ] `rg -n "9 quality gates|gates 1-9|## The 9 Gates" aloop/templates/instructions/review.md` returns no matches.
- [ ] `aloop/templates/PROMPT_review.md` continues to contain `{{include:instructions/review.md}}` with valid frontmatter.

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1  
**Dependencies:** none

