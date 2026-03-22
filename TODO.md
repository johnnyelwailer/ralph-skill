# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

(no tasks remaining)

### Up Next

(no tasks remaining after current in-progress item)

### Completed

- [x] Expand `aloop/templates/subagent-hints-proof.md` with vision-model delegation examples: added when-to-delegate guidance, task tool syntax with screenshot paths and baseline comparisons, vision-reviewer output format, and accessibility-checker vs vision-reviewer usage guidance.



- [x] Proof skip protocol: when proof-manifest.json has an empty `artifacts` array, log the skip reason from `skipped` entries but do NOT treat as iteration failure. Both `check_proof_skip` (loop.sh) and `Test-ProofSkip` (loop.ps1) implemented and verified via runtime QA (`event=proof_skipped` logged with reason). [reviewed: gates 1-10 pass]

- [x] [review] Gate 10: QA coverage moved from 28.6% → 63.6% (7 PASS / 11 features) after proof skip protocol enabled runtime QA testing of proof-phase features.

- [x] [review] Gate 10 QA re-verification executed. Updated QA_COVERAGE.md and QA_LOG.md with runtime re-tests showing: template placeholder substitution PASS at runtime, baselines directory creation PASS, proof manifest validation PASS, proof skip protocol PASS (proof_skipped event logged with reason).

- [x] [qa/P1] Re-verify template variable resolution at runtime: RESOLVED — QA_COVERAGE.md shows PASS. Runtime-captured proof prompt resolved to concrete session path in both loop.ps1 and loop.sh.

- [x] [qa/P1] Re-verify baselines directory creation: RESOLVED — QA_COVERAGE.md shows PASS. `artifacts/baselines/` exists in runtime QA sessions for both shell implementations.
