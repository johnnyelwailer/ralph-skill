# Issue #104: QA coverage enforcement in finalizer and loop script phase support

## Current Phase: Implementation

### In Progress
- [x] [qa/P1] Default scaffold missing pipeline.yml — finalizer array empty: fixed in project.mjs scaffoldWorkspace() — now generates `<projectRoot>/.aloop/pipeline.yml` with standard finalizer chain during scaffold if it doesn't already exist. Does not overwrite existing pipeline.yml. Tests added to project.test.ts.

### Up Next

- [ ] [spec-gap/P1] loop.sh provider validation missing `opencode` — line 2239 validates `claude|codex|gemini|copilot|round-robin` but omits `opencode`. Running `loop.sh --provider opencode` fails with "Invalid provider" error. loop.ps1 correctly includes `opencode` at line 28. **Fix:** add `opencode` to the case statement at `aloop/bin/loop.sh:2239` and help text at line 68.

- [ ] [spec-gap/P1] loop.sh CLAUDE_MODEL default is `sonnet` (line 33) but config.yml (the declared single source of truth, line 17) says `opus`. loop.ps1 correctly defaults to `opus` (line 34). **Fix:** change loop.sh line 33 from `sonnet` to `opus` — `aloop/bin/loop.sh:33`.

- [ ] [spec-gap/P2] loop.sh round-robin default diverged from config.yml — loop.sh line 31 defaults to `claude,gemini,opencode` (3 providers), config.yml `round_robin_order` lists `claude,opencode,codex,gemini,copilot` (5 providers). loop.ps1 line 31 correctly uses all 5. **Fix:** update loop.sh default at `aloop/bin/loop.sh:31` to match config.yml.

- [ ] [spec-gap/P2] Cross-runtime parity: periodic spec-gap/docs cycle resolution differs between loop.sh and loop.ps1 (fallback path when no loop-plan.json). loop.sh uses 17-step pattern with periodic spec-gap but no periodic docs. loop.ps1 uses 8-step pattern with neither. SPEC (lines 804-807) says both spec-gap AND docs should run every 2nd cycle (18-step: 8+10). **Files:** `aloop/bin/loop.sh:641-656`, `aloop/bin/loop.ps1:248-260`. **Fix:** align both scripts to the 18-step pattern from SPEC, or update SPEC if the compile-loop-plan path makes the fallback obsolete.

- [ ] [spec-gap/P2] SPEC.md stale acceptance criteria — lines 717 and 775 say default pipeline includes proof in the continuous cycle (9-step: plan → build×5 → proof → qa → review). But SPEC lines 404-407 explicitly say "Proof does NOT run in the cycle" and pipeline.yml confirms 8-step cycle without proof. Proof is finalizer-only. **Fix:** update SPEC.md acceptance criteria at lines 717 and 775 to reflect 8-step cycle (proof in finalizer only).

### Completed
- [x] Verify all six finalizer prompts load correctly — all templates exist in aloop/templates/ (PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md, PROMPT_proof.md) with correct trigger chain frontmatter (spec-gap→docs→spec-review→final-review→final-qa→proof). resolve_finalizer_prompt (loop.sh:801-826) and Resolve-FinalizerPrompt (loop.ps1:389-405) resolve correctly. Include files (instructions/review.md, instructions/qa.md) present.
- [x] [qa/P1] pipeline.yml compilation into loop-plan.json finalizer array: `readFinalizerFromPipeline()` in compile-loop-plan.ts:268-284 correctly reads `<projectRoot>/.aloop/pipeline.yml` and populates the finalizer array. Tests at compile-loop-plan.test.ts:701-774 cover all cases (with finalizer, without finalizer section, missing file). Previous TODO description was misleading — the code looks at `<projectRoot>/.aloop/pipeline.yml`, not `~/.aloop/projects/<hash>/pipeline.yml`. The empty finalizer was caused by scaffold not creating the file, not by compile-loop-plan ignoring it.
- [x] [qa/P1] Finalizer prompt files not copied to session prompts directory — fixed at 8ef27976: LOOP_PROMPT_TEMPLATES in project.mjs:729 now includes all finalizer prompts
- [x] [qa/P0-needs-verification] Finalizer skipped when allTasksMarkedDone=true — root cause identified: FINALIZER_LENGTH=0 because pipeline.yml was missing from scaffold. Loop scripts correctly enter finalizer when finalizerLength>0. Not a code bug in loop.sh/loop.ps1.
- [x] [review] Gate 1: QA coverage gate returns success when QA_COVERAGE.md missing — fixed at 87bca89c
- [x] [review] Gate 2: PowerShell Pester behavioral tests for QA coverage gate — added at c61d34c0
- [x] Add QA coverage parsing function to `loop.sh` — reads QA_COVERAGE.md pipe-delimited table, counts PASS/FAIL rows, computes coverage percentage. Must handle missing file gracefully (skip enforcement, return success). Format: `| Feature | Last Tested | Commit | Result | Notes |`
- [x] Add finalizer QA coverage check in `loop.sh` — after advancing FINALIZER_POSITION (line ~2240), before the existing TODO completeness check, call the QA coverage function. If coverage < 70% or any FAIL features exist, abort finalizer (reset FINALIZER_MODE/POSITION, set ALL_TASKS_MARKED_DONE=false). Log coverage result with percentage via write_log_entry
- [x] Add equivalent QA coverage parsing function to `loop.ps1` — same logic as loop.sh, PowerShell implementation
- [x] Add finalizer QA coverage check in `loop.ps1` — same abort logic as loop.sh, after line ~2181. Use Write-LogEntry for coverage check logging
- [x] Update `iteration_mode` validation in `loop.sh` `register_iteration_failure()` (line 698) to accept periodic agent modes: add "spec-gap" and "docs" to the allowed modes so failure retry tracking works when these agents are injected into the cycle
- [x] Update `iteration_mode` validation in `loop.ps1` `Register-IterationFailure` (line 929) to accept "spec-gap" and "docs" modes
