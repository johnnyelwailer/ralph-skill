## Summary

Implements a structured QA coverage matrix with priority-based feature selection and a finalizer-level QA coverage gate. The QA agent now uses an explicit priority algorithm (P1: UNTESTED, P2: FAIL, P3: incomplete criteria, P4: stale PASS) to select test targets, extracts acceptance criteria per feature before testing, and writes results to a machine-readable QA_COVERAGE.md with 7 fixed columns. The loop's finalizer aborts completion if QA_COVERAGE.md has any FAIL rows or >30% UNTESTED rows, preventing premature loop exit with untested features.

## Files Changed

- `aloop/bin/loop.sh` — added `append_plan_task_if_missing()` and `check_finalizer_qa_coverage_gate()` functions; QA gate check before finalizer completion (lines 1527-1611, 2219-2238)
- `aloop/bin/loop_finalizer_qa_coverage.tests.sh` — new test file with 4 test cases for the QA coverage gate
- `aloop/templates/instructions/review.md` — added Gate 10: QA Coverage & Bug Fix Rate to ensure coverage is maintained and bugs are fixed before completion
- `aloop/templates/instructions/qa.md` — restructured with priority selection algorithm (P1-P4), acceptance criteria extraction step, structured QA_COVERAGE.md format (7 columns), and per-criterion session logging

## Verification

- [x] QA coverage gate blocks finalizer completion when FAIL rows exist — verified by `case_blocks_when_fail_rows_exist`
- [x] QA coverage gate blocks when UNTESTED >30% — verified by `case_blocks_when_untested_exceeds_threshold`
- [x] QA coverage gate passes at <=30% UNTESTED, 0 FAIL — verified by `case_gate_passes_when_threshold_is_met`
- [x] QA coverage gate skips when QA_COVERAGE.md missing — verified by `case_skips_enforcement_when_coverage_file_missing`
- [x] QA agent instructions include priority selection algorithm with P1-P4 ordering
- [x] QA agent extracts acceptance criteria per feature before testing
- [x] QA_COVERAGE.md format has 7 machine-readable columns with header comments

## Proof Artifacts

- N/A — internal script and template changes with no observable external output
