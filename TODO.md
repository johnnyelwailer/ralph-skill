# Issue #104: QA coverage enforcement in finalizer and loop script phase support

## Current Phase: Implementation

### In Progress
- [ ] [review] Gate 1: `check_finalizer_qa_coverage_gate` in loop.sh:1831-1835 and `Check-FinalizerQaCoverageGate` in loop.ps1:872-876 return failure when QA_COVERAGE.md is missing, blocking the finalizer — TASK_SPEC.md acceptance criteria says "Graceful handling when QA_COVERAGE.md doesn't exist (skip enforcement, don't block)". Change both to return success (0/$true) when file is missing. Also fix the test in loop_finalizer_qa_coverage.tests.sh:128-144 which validates the wrong behavior (priority: high)
- [ ] [review] Gate 2: `Check-FinalizerQaCoverageGate` in loop.ps1 has no behavioral test — loop.tests.ps1:897-908 only checks source code string patterns, not actual gate logic. Add PowerShell Pester tests that create test QA_COVERAGE.md files and validate gate pass/fail/block behavior with concrete assertions, matching the bash test coverage in loop_finalizer_qa_coverage.tests.sh (priority: high)

### Up Next
- [ ] [qa/P0] Finalizer skipped when allTasksMarkedDone=true at session start: Started session with all TODO.md tasks checked and QA_COVERAGE.md containing FAIL entries → loop set state=completed after ~1 second without entering finalizer → SPEC says loop must enter finalizer[0..N] when allTasksMarkedDone=true at cycle boundary, not skip directly to completed. Tested at iter 5. (priority: critical)
- [ ] [qa/P1] Finalizer prompt files not copied to session prompts directory: Started session with pipeline.yml defining 6 finalizer agents → loop-plan.json correctly lists PROMPT_spec-gap.md etc in finalizer[] array → but session prompts/ only contains cycle prompts (plan, build, qa, review, proof, steer), missing spec-gap, docs, spec-review, final-review, final-qa → loop.sh will fail to find prompts when finalizer fires. Tested at iter 5. (priority: high)
- [ ] [qa/P1] Default scaffold missing pipeline.yml — finalizer array empty: Ran `aloop scaffold` on project without .aloop/pipeline.yml → loop-plan.json has `"finalizer": []` → no finalizer agents, QA coverage gate can never fire → scaffold should generate default pipeline.yml with standard finalizer chain, or the CLI should populate finalizer from templates. Tested at iter 5. (priority: high)
- [ ] Verify all six finalizer prompts load correctly — confirm PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md, PROMPT_proof.md exist in aloop/templates/ and resolve correctly via resolve_finalizer_prompt/Resolve-FinalizerPrompt. Verify frontmatter has correct trigger chain

### Completed
- [x] Add QA coverage parsing function to `loop.sh` — reads QA_COVERAGE.md pipe-delimited table, counts PASS/FAIL rows, computes coverage percentage. Must handle missing file gracefully (skip enforcement, return success). Format: `| Feature | Last Tested | Commit | Result | Notes |`
- [x] Add finalizer QA coverage check in `loop.sh` — after advancing FINALIZER_POSITION (line ~2240), before the existing TODO completeness check, call the QA coverage function. If coverage < 70% or any FAIL features exist, abort finalizer (reset FINALIZER_MODE/POSITION, set ALL_TASKS_MARKED_DONE=false). Log coverage result with percentage via write_log_entry
- [x] Add equivalent QA coverage parsing function to `loop.ps1` — same logic as loop.sh, PowerShell implementation
- [x] Add finalizer QA coverage check in `loop.ps1` — same abort logic as loop.sh, after line ~2181. Use Write-LogEntry for coverage check logging
- [x] Update `iteration_mode` validation in `loop.sh` `register_iteration_failure()` (line 698) to accept periodic agent modes: add "spec-gap" and "docs" to the allowed modes so failure retry tracking works when these agents are injected into the cycle
- [x] Update `iteration_mode` validation in `loop.ps1` `Register-IterationFailure` (line 929) to accept "spec-gap" and "docs" modes
