# Issue #71: Review agent Gate 10: QA coverage trend and bug fix rate

## Tasks

### In Progress

- [ ] Revert `aloop/templates/instructions/qa.md` changes (out of scope per spec — "Do NOT modify: aloop/templates/instructions/qa.md"; Constitution Rule 12: one issue, one concern). The 7-column QA_COVERAGE.md format change and expanded `0d` section were added in commit 631780ad but are explicitly excluded from this issue's scope. (priority: high)

- [ ] [qa/P1] aloop/templates/instructions/qa.md modified in violation of spec scope: commit 631780ad changed the `0d. Check coverage gaps` section (expanded from 1 line to 4 lines) and changed the QA_COVERAGE.md table format in step 5 from 5-column to 7-column. Spec explicitly prohibits modifications to qa.md ("Do NOT modify: aloop/templates/instructions/qa.md"). Revert these changes to restore qa.md to its pre-631780ad state. Tested at iter 5. (priority: high)

### Completed

- [x] Revert `aloop/bin/loop.sh` additions (Constitution Rule 1 violation: loop.sh grew by 125+ lines, now 2438 LOC; must shrink, never grow). Remove the `append_plan_task_if_missing` and `check_finalizer_qa_coverage_gate` functions added in commit 631780ad. Any coverage gate enforcement logic must live in the runtime (`process-requests.ts`, `orchestrate.ts`, or a new CLI command), not in loop.sh. (priority: critical)

- [x] Add `### Gate 10: QA Coverage & Bug Fix Rate` to `aloop/templates/instructions/review.md` after Gate 9 — verified present at lines 136-143 with correct coverage formula `(PASS + FAIL) / total features`, `< 30%` FAIL condition, `[qa/P1] >3 iterations` stale bug FAIL condition, and mandatory trend statement.
- [x] Update all gate-count references in `aloop/templates/instructions/review.md` from 9 to 10 — verified: "10 quality gates", "the 10 gates below", "## The 10 Gates", "[reviewed: gates 1-10 pass]", "chore(review): PASS — gates 1-10 pass" all present; `rg "9 quality gates|gates 1-9|## The 9 Gates"` returns no matches.
- [x] Verify `aloop/templates/PROMPT_review.md` — confirmed contains `{{include:instructions/review.md}}` with valid frontmatter (agent: review, provider: claude, reasoning: high).
