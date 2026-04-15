# Issue #73: QA coverage enforcement in finalizer (final-qa abort logic)

## Tasks

### In Progress
_(none)_

### Up Next
_(none)_

### Deferred / Out of scope
_(none)_

### Completed

- [x] Add finalizer-specific preamble before `{{include:instructions/qa.md}}` in `PROMPT_final-qa.md`
- [x] Instruct final-qa to read `QA_COVERAGE.md` and compute `total_features`, `untested_count`, `fail_count`, `coverage_percent`
- [x] Gate A: if untested > 30%, file one `[qa/P1]` TODO per untested feature and stop
- [x] Gate B: if any FAIL features exist, file one `[qa/P1]` TODO per FAIL feature and stop
- [x] Normal QA proceeds only when `fail_count == 0` and untested ratio `<= 30%`
- [x] Completion criteria: coverage `>= 70%`, 0 FAIL features, no unresolved `[qa/P1]` TODOs
- [x] Require coverage summary (total/untested/fail/coverage%) in `QA_LOG.md` session entries
- [x] Preserve shared include line `{{include:instructions/qa.md}}`
