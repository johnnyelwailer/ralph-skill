# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [x] [review] Gate 4: `loop.tests.ps1` — dead code in fake providers after test deletion. The `proof-invalid-manifest` scenario branch is now unreachable: line 91 (bash fake provider, `elif [ "$SCENARIO" = "proof-invalid-manifest" ]`) and line 751 (ps1 fake provider, `} elseif ($state.scenario -eq 'proof-invalid-manifest') {`). The only test that exercised this scenario (`'proof manifest validation fails proof iteration when JSON is invalid'`) was deleted in `fd4a70cfd`. Remove both branches from the fake providers. (priority: medium)

### Up Next

- [x] [qa/P1] Fix: queue_override proof iterations missing placeholder substitution and proof_manifest events. Root cause (confirmed via code + QA log analysis): `run_queue_if_present` in loop.sh and `Run-QueueIfPresent` in loop.ps1 both (a) do NOT call `substitute_prompt_placeholders`/`Resolve-PromptPlaceholders`, so `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` are passed literally to the proof agent — agent wrote manifest to project's `.aloop/artifacts/iter-1/` instead of the session's `artifacts/iter-8/` path; (b) do NOT create `artifacts/iter-$ITERATION/` before invocation; (c) do NOT emit `proof_manifest_found`/`proof_manifest_missing` events after successful proof invocation. Fix required in both loop.sh (`run_queue_if_present`, lines ~2037–2098) and loop.ps1 (`Run-QueueIfPresent`, lines ~2103–2190). Also add regression tests in loop.tests.ps1 verifying that a queue_override proof iteration emits the correct event. (priority: high)

- [ ] [review] Gate 6: QA agent violated CONSTITUTION rule 16. The QA session (commit `8f782ea43`, QA_LOG.md lines 37-74) used `sed` and `grep` to read source files (`loop.sh`, `loop.ps1`) for all "PASS" results — this is explicitly prohibited ("QA agents never read source code. They test exclusively through CLI commands, HTTP endpoints, and browser interaction"). All QA results derived from source inspection are invalid. Need a clean behavioral re-test that:
  (a) Starts a real aloop session with a proof-mode iteration
  (b) Checks `aloop log` events for `proof_manifest_found` (file present) and `proof_manifest_missing` (file absent, no iteration failure)
  without reading source code. (priority: high)
  **Blocked on [qa/P1]**: Once the queue_override fix is in, the proof agent will receive the correct `{{ARTIFACTS_DIR}}/iter-N/` path and write proof-manifest.json to the right location, so the existence check will fire and emit the event.
  **QA iter-22 status**: Clean behavioral re-test attempted (QA_LOG.md iter-22). Behavioral tests PASS for artifacts/iter-N/, aloop update, pipeline.yml finalizer compilation. proof_manifest events BLOCKED — /tmp disk full (SIGABRT) prevented proof-phase execution. A new bug was found: allTasksMarkedDone=true at startup bypasses the finalizer (see [qa/P2] below). Gate 6 remains open until proof_manifest events verified in a session that reaches the finalizer.
  **QA iter-96 status**: Behavioral re-test completed via qa-proof-events-1774628537 session (runtime 18be430cc). Proof step RAN at iter 8 (queue_override_complete). Result: FAIL — no proof_manifest_found or proof_manifest_missing event emitted in log.jsonl after proof iteration. Bug filed as [qa/P1].

### Completed

- [x] [qa/P2] Loop exits as "completed" without running finalizer when all TODOs are done at session start: Fixed in `monitor.ts` — chain-completion check now verifies all finalizer steps have completed (`finalizerPosition >= finalizer.length`) before marking session as done. Previously, the monitor would SIGTERM the loop after the first finalizer step (spec-gap) completed via queue override, skipping the remaining 5 finalizer steps (docs, spec-review, final-review, final-qa, proof). Reproduced in qa-proof-final-1774617658-20260327-132110 and qa-proof-pipeline-1774617540-20260327-131927. (priority: medium)

- [x] [review] Gate 2/3/4: `loop.tests.ps1` updated after refactor in `0ca241668`. Verified: (a) `Describe 'loop.ps1 — Validate-ProofManifest'` block deleted (replaced by `Register-IterationFailure proof mode` test at line 429); (b) integration tests at lines 252-288 and 1014-1038 now assert `proof_manifest_found` and `proof_manifest_missing` events with correct no-`iteration_error` assertions; (c) tests for `proof_manifest_missing` not causing `iteration_error` added at lines 273-289 and 1024-1039.

- [x] [spec-gap/P2] Fixed SPEC.md internal inconsistency: updated 9 stale references that incorrectly placed proof in the continuous 9-step cycle. Corrected to reflect authoritative design: 8-step continuous cycle (`plan → build × 5 → qa → review`) with proof running only in the completion finalizer. Affected lines: 5, 717, 733, 775, 1299, 1321, 1868, 2124, 3426.

- [x] Expand `aloop/templates/subagent-hints-proof.md` with vision-model delegation examples: added when-to-delegate guidance, task tool syntax with screenshot paths and baseline comparisons, vision-reviewer output format, and accessibility-checker vs vision-reviewer usage guidance.

- [x] Proof artifact infrastructure (0ca241668):
  - `artifacts/iter-N/` created before `invoke_provider` call (loop.sh:2228, loop.ps1:2341)
  - `artifacts/baselines/` created at session init (loop.sh:1946, loop.ps1:1980)
  - Existence-only check for `proof-manifest.json` after proof iteration (loop.sh:2244-2255, loop.ps1:2364-2381)
  - Removed JSON-parsing functions (`validate_proof_manifest`, `check_proof_skip`, `Validate-ProofManifest`, `Test-ProofSkip`) per TASK_SPEC Out-of-Scope and CONSTITUTION rule #1
