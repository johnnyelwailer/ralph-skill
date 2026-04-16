# Issue #23: Epic: Inner Loop Engine — Phase Control, Retry & Finalizer

## Tasks

- [ ] Implement as described in the issue
- [ ] [qa/P1] loop_finalizer_qa_coverage.tests.sh fails: `check_finalizer_qa_coverage_gate` and `append_plan_task_if_missing` functions referenced by test file do not exist in loop.sh — all 4 tests fail with `command not found`. Run `bash aloop/bin/loop_finalizer_qa_coverage.tests.sh` to reproduce. (priority: high)
- [ ] [qa/P1] Branch sync not implemented in loop.sh: spec requires pre-iteration `git fetch origin <base_branch>` + merge + conflict queueing (`PROMPT_merge.md`) + `merge_conflict` log event, but no such code exists in loop.sh. Grep `git fetch` or `merge_conflict` in loop.sh returns empty. (priority: high)
