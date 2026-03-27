# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [x] [review] Gate 2/3/4: `loop.tests.ps1` not updated after refactor in `0ca241668`. Three categories of stale tests:
  (a) `Describe 'loop.ps1 — Validate-ProofManifest'` (loop.tests.ps1:434-490): tests a function that was deleted from loop.ps1 — BeforeAll will throw "Failed to locate Validate-ProofManifest in loop.ps1"
  (b) Integration tests at lines 250-297 and 1067-1092: assert `proof_manifest_validated` event (no longer emitted) and `iteration_error` with `proof_manifest_invalid_json` (no longer happens, missing manifest now only logs a warning)
  (c) Zero tests for the new `proof_manifest_found` and `proof_manifest_missing` events.
  Fix: (1) delete the Validate-ProofManifest describe block, (2) update integration test at line 266 to assert `proof_manifest_found` event instead of `proof_manifest_validated`, (3) update/remove assertions at lines 287-293 and 1088-1092 that expect JSON-invalid failure behavior, (4) add a test verifying proof_manifest_missing does NOT cause iteration_error. (priority: high)

### Up Next

- [ ] [review] Gate 6: QA agent violated CONSTITUTION rule 16. The QA session (commit `8f782ea43`, QA_LOG.md lines 37-74) used `sed` and `grep` to read source files (`loop.sh`, `loop.ps1`) for all "PASS" results — this is explicitly prohibited ("QA agents never read source code. They test exclusively through CLI commands, HTTP endpoints, and browser interaction"). All QA results derived from source inspection are invalid. Need a clean behavioral re-test that:
  (a) Starts a real aloop session with a proof-mode iteration
  (b) Checks `aloop log` events for `proof_manifest_found` (file present) and `proof_manifest_missing` (file absent, no iteration failure)
  without reading source code. (priority: high)
  **QA iter-22 status**: Clean behavioral re-test attempted (QA_LOG.md iter-22). Behavioral tests PASS for artifacts/iter-N/, aloop update, pipeline.yml finalizer compilation. proof_manifest events BLOCKED — /tmp disk full (SIGABRT) prevented proof-phase execution. A new bug was found: allTasksMarkedDone=true at startup bypasses the finalizer (see [qa/P2] below). Gate 6 remains open until proof_manifest events verified in a session that reaches the finalizer.

- [ ] [qa/P2] Loop exits as "completed" without running finalizer when all TODOs are done at session start: When `aloop start` is run on a project where `TODO.md` has all tasks marked `[x]`, the compiled `loop-plan.json` has `allTasksMarkedDone: true` and the loop immediately exits as "completed" without entering the finalizer or running the proof agent. Reproduced in qa-proof-final-1774617658-20260327-132110 and qa-proof-pipeline-1774617540-20260327-131927. Spec says "completion can only happen via finalizer." Filed at iter 22. (priority: medium)

### Completed

- [x] [spec-gap/P2] Fixed SPEC.md internal inconsistency: updated 9 stale references that incorrectly placed proof in the continuous 9-step cycle. Corrected to reflect authoritative design: 8-step continuous cycle (`plan → build × 5 → qa → review`) with proof running only in the completion finalizer. Affected lines: 5, 717, 733, 775, 1299, 1321, 1868, 2124, 3426.

- [x] Expand `aloop/templates/subagent-hints-proof.md` with vision-model delegation examples: added when-to-delegate guidance, task tool syntax with screenshot paths and baseline comparisons, vision-reviewer output format, and accessibility-checker vs vision-reviewer usage guidance.

- [x] Proof artifact infrastructure (0ca241668):
  - `artifacts/iter-N/` created before `invoke_provider` call (loop.sh:2228, loop.ps1:2341)
  - `artifacts/baselines/` created at session init (loop.sh:1946, loop.ps1:1980)
  - Existence-only check for `proof-manifest.json` after proof iteration (loop.sh:2244-2255, loop.ps1:2364-2381)
  - Removed JSON-parsing functions (`validate_proof_manifest`, `check_proof_skip`, `Validate-ProofManifest`, `Test-ProofSkip`) per TASK_SPEC Out-of-Scope and CONSTITUTION rule #1
