# Issue #73: QA coverage enforcement in finalizer (final-qa abort logic)

## Objective

Update `aloop/templates/PROMPT_final-qa.md` so the **finalizer QA pass** enforces QA coverage thresholds before loop exit, using TODO-based abort behavior already present in the loop runners.

## Context

The finalizer already aborts when new incomplete TODOs appear. This issue uses that mechanism: final-qa reads `QA_COVERAGE.md`, files `[qa/P1]` TODOs when coverage gates fail, and exits so the finalizer is reset on the next TODO re-check.

This issue is a prompt-level change only.

## Architectural Context

- Finalizer sequencing is defined in `.aloop/pipeline.yml`; `PROMPT_final-qa.md` runs near loop exit after review stages.
- `aloop/templates/PROMPT_final-qa.md` currently delegates entirely to `{{include:instructions/qa.md}}` and has no finalizer-specific coverage gate behavior.
- Coverage state lives in `QA_COVERAGE.md`; defect backlog lives in `TODO.md`; QA evidence lives in `QA_LOG.md`.
- Loop runners (`aloop/bin/loop.sh`, `aloop/bin/loop.ps1`) already contain finalizer abort logic based on new incomplete TODOs. This issue must integrate with that existing contract, not replace it.

## Scope

In scope for modification:

- `aloop/templates/PROMPT_final-qa.md`

Required changes in this file:

1. Add a finalizer-specific preamble **before** the shared QA instructions include.
2. Define explicit pre-test coverage gate behavior:
   - Read `QA_COVERAGE.md`
   - Compute: `total_features`, `untested_count`, `fail_count`, `coverage_percent = ((PASS + FAIL) / total_features) * 100`
   - If `untested_count / total_features > 30%`: file one `[qa/P1]` TODO per untested feature and stop.
   - If `fail_count > 0`: file one `[qa/P1]` TODO per FAIL feature and stop.
   - Only continue with normal QA testing when `fail_count == 0` and `untested_count / total_features <= 30%`.
3. Define final-qa completion thresholds (loop-exit criteria):
   - Coverage `>= 70%`
   - `0` FAIL features
   - No unresolved `[qa/P1]` bugs in `TODO.md`
4. Require a coverage summary in the QA session log entry (`QA_LOG.md`) including total, untested, fail, and coverage percent.
5. Preserve the shared include line (`{{include:instructions/qa.md}}`) so baseline QA rules still apply.

## Out of Scope

Do **not** modify:

- `aloop/bin/loop.sh`
- `aloop/bin/loop.ps1`
- `aloop/templates/instructions/qa.md`
- `aloop/cli/src/**`
- `SPEC.md`, `SPEC-ADDENDUM.md`

Rationale:

- Constitution Rule 1: loop runners remain dumb orchestrators; no new business logic for this issue.
- Constitution Rule 12: one issue, one concern (final-qa prompt refinement only).
- Constitution Rule 19: avoid scope expansion and unrelated platform/runtime changes.
- Constitution Rule 18: respect file ownership and declared scope.

## Constraints

- Keep this as a prompt contract change; no runtime/shell enforcement work in this issue.
- Use `[qa/P1]` TODO creation as the only mechanism to trigger finalizer abort via existing behavior.
- The preamble may tighten behavior for final-qa, but must not relax existing QA constraints from `instructions/qa.md` (including black-box testing expectations).
- Threshold source of truth for this issue is the explicit criteria above (`<=30%` untested gate for testing and `>=70%` coverage for completion).
- Keep wording implementation-ready and deterministic; avoid ambiguous terms like “low coverage” without numeric thresholds.

## Acceptance Criteria

- [ ] `aloop/templates/PROMPT_final-qa.md` contains a finalizer-specific section before `{{include:instructions/qa.md}}`.
- [ ] The prompt explicitly instructs final-qa to read `QA_COVERAGE.md` and compute `total_features`, `untested_count`, `fail_count`, and `coverage_percent`.
- [ ] The prompt states: if untested coverage exceeds `30%`, file one `[qa/P1]` TODO per untested feature and stop without selecting test targets.
- [ ] The prompt states: if any FAIL features exist, file one `[qa/P1]` TODO per FAIL feature and stop without selecting test targets.
- [ ] The prompt states normal QA testing proceeds only when `fail_count == 0` and untested ratio is `<= 30%`.
- [ ] The prompt states final-qa completion requires coverage `>= 70%`, `0` FAIL features, and no unresolved `[qa/P1]` TODOs.
- [ ] The prompt requires a coverage summary line in `QA_LOG.md` session output (total/untested/fail/coverage%).
- [ ] No files outside the in-scope list are modified.

## Labels

`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1  
**Dependencies:** none
