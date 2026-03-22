# Sub-Spec: Issue #104 — QA coverage enforcement in finalizer and loop script phase support

## Objective

Add QA coverage enforcement to the finalizer abort logic: the finalizer should abort if QA coverage < 70% or any FAIL features remain in QA_COVERAGE.md. Also ensure both loop scripts properly support all new agent phases.

## Scope

The finalizer currently aborts only when new incomplete tasks appear in TODO.md (line ~2238 in loop.sh, line ~2175 in loop.ps1). It needs additional checks:
1. Parse `QA_COVERAGE.md` for coverage percentage and FAIL entries
2. If coverage < 70% or any FAIL features exist, abort finalizer and return to cycle

The loop scripts validate `iteration_mode` against `plan|build|qa|review` (line 696 in loop.sh, line 929 in loop.ps1). Finalizer agents bypass this (they use prompt filenames), but cycle-injected periodic agents (spec-gap, docs) may need validation updates.

## Deliverables

- [ ] Add QA coverage parsing function to `loop.sh`: reads QA_COVERAGE.md, counts PASS/FAIL/total, computes percentage
- [ ] Add equivalent function to `loop.ps1`
- [ ] Finalizer abort logic: before advancing finalizer position, check QA coverage — abort if < 70% or any FAIL
- [ ] Log QA coverage check results (pass/fail with percentage) in session log
- [ ] Ensure `iteration_mode` validation in both scripts accepts periodic agents (spec-gap, docs) when injected into cycle
- [ ] Verify all finalizer prompts (PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md, PROMPT_proof.md) load and execute correctly in both scripts

## Files

- `aloop/bin/loop.sh` (modify — finalizer abort section, mode validation)
- `aloop/bin/loop.ps1` (modify — finalizer abort section, mode validation)

## Acceptance Criteria

- Finalizer aborts if QA coverage < 70%
- Finalizer aborts if any FAIL features remain in QA_COVERAGE.md
- Coverage check logged in session log with percentage
- All six finalizer prompts execute correctly in both loop.sh and loop.ps1
- Periodic agents (spec-gap, docs) accepted when injected into cycle
- Graceful handling when QA_COVERAGE.md doesn't exist (skip enforcement, don't block)
