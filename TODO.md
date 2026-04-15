# Issue #73: QA coverage enforcement in finalizer (final-qa abort logic)

## Tasks

### Up Next

- [x] Revert out-of-scope `loop.sh` additions: remove `append_plan_task_if_missing()`, `check_finalizer_qa_coverage_gate()`, and all calls to them (added in commits bc3eaf85 and 64ec8e1b). CONSTITUTION Rule 1 forbids any additions to loop.sh; SPEC explicitly lists loop.sh as out of scope. The prompt-level gate in PROMPT_final-qa.md is sufficient — no shell enforcement is needed.
- [x] [review] Gate 1: Revert out-of-scope `loop.ps1` additions — remove `Append-PlanTaskIfMissing`, `Check-FinalizerQaCoverageGate`, and all calls to them (lines 854, 862, 919, 921, 2146). Commit `3a2b184f` also changed the threshold from 30→20 (line 919: `> 20`, line 921: `<=20%`) which is wrong per spec (should be 30%). Revert the threshold too. SPEC explicitly excludes loop.ps1; Constitution Rule 1 forbids loop runner growth. (priority: high)
- [ ] [review] Gate 1: Remove `aloop/bin/loop_finalizer_qa_coverage.tests.sh` — tests out-of-scope loop.sh functions; the file fixture was also modified during this branch. No purpose once out-of-scope loop functions are removed. (priority: high)

### Completed

- [x] Add finalizer-specific preamble to `aloop/templates/PROMPT_final-qa.md` before `{{include:instructions/qa.md}}` — implemented in commit a91993d6, refined in subsequent commits. All 7 content acceptance criteria are met: Step 1 computes metrics, Gate A blocks on >30% untested, Gate B blocks on any FAIL, Step 3 passes both, completion criteria and coverage summary requirement are present.
