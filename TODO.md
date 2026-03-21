# Issue #102: Review Gate 10: QA trend checking

## Current Phase: Implementation

### In Progress

### Completed
- [x] Add Gate 10 (QA Coverage & Bug Fix Rate) section to `aloop/templates/instructions/review.md` after Gate 9 — includes: parse QA_COVERAGE.md for coverage %, scan TODO.md for stale [qa/P1] bugs, fail criteria (coverage < 30%, stale P1 > 3 iterations), graceful skip when QA_COVERAGE.md absent
- [x] Update all references to "9 gates" in review.md to "10 gates" — affects: process step 2 ("9 gates"), approval flow ("gates 1-9 pass" x2), objective line

### Spec-Gap Analysis

- [ ] [spec-gap/P2] review.md line 24 heading still says "## The 9 Gates" — should be "## The 10 Gates". All other references were updated to 10 but this heading was missed. **Files:** `aloop/templates/instructions/review.md:24`. **Fix:** update heading text.

- [ ] [spec-gap/P1] loop.ps1 missing proof artifact infrastructure — loop.sh has full implementation (baselines dir creation, per-iteration `mkdir`, `validate_proof_manifest`, proof manifest validation after proof phase) but loop.ps1 has none of this. TASK_SPEC.md says "Both `loop.sh` and `loop.ps1` updated consistently". **Files:** `aloop/bin/loop.ps1` (missing), `aloop/bin/loop.sh:603-622,1963-1964,2244-2277` (reference implementation). **Fix:** port proof artifact creation, manifest validation, and baselines dir setup from loop.sh to loop.ps1.

- [ ] [spec-gap/P2] Baseline update after review approval not implemented — both scripts create `artifacts/baselines/` dir but neither copies latest artifacts to baselines after review approval. TASK_SPEC says "after review approval, latest artifacts become new baselines"; SPEC.md acceptance criteria (line 721): "Baselines are stored per-session and updated after review approval". **Files:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`. **Fix:** add logic after review-pass to copy latest proof iteration artifacts into `baselines/`.

- [ ] [spec-gap/P2] subagent-hints-proof.md not expanded with vision-model delegation examples — TASK_SPEC.md deliverable: "Expand `subagent-hints-proof.md` with vision-model delegation examples (reference `aloop/agents/opencode/vision-reviewer.md`)". File is still only 5 lines with no delegation examples. **Files:** `aloop/templates/subagent-hints-proof.md`. **Fix:** add concrete vision-model delegation usage examples referencing vision-reviewer.md.
