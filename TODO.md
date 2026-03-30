# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [x] Fix Gates 1(b)+4: Restore `cr_analysis` event block in `.aloop/pipeline.yml` (removed without authorization in 45e927b6e). Restoring it also resolves Gate 4 (PROMPT_orch_cr_analysis.md becomes referenced again). Restore the full block: `cr_analysis: prompt: PROMPT_orch_cr_analysis.md, batch: 2, filter: {is_change_request: true, cr_spec_updated: false}, result_pattern: cr-analysis-result-{issue_number}.json`. (priority: high)
- [x] Fix Gate 1(a): Remove `PROMPT_cleanup.md` from the finalizer list in `.aloop/pipeline.yml` and delete `aloop/templates/PROMPT_cleanup.md`. The file was added out of scope with no orchestrator authorization; removing it from the finalizer reverts the unauthorized scope expansion. CONSTITUTION rule #12 violation — spec rewrite + feature bundled in one commit. (priority: high) [reviewed: gates 1-10 pass]

- [x] [review] Gate 6: Behavioral QA re-test for `proof_manifest_found`/`proof_manifest_missing` events. PASS (2026-03-29):
  - (a) queue_override proof iteration ran via Pester behavioral test (loop.tests.ps1:3684, 3728)
  - (b) `proof_manifest_found` PASS (manifest present), `proof_manifest_missing` PASS (absent, no iteration_error)
  - (c) `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` verified via proof path matching — PASS
  - (d) `bash -n` on loop.sh PASS (both installed and worktree copies)

### Up Next

- [ ] (no tasks remaining after fix tasks above complete)

### Completed

- [x] Move `mkdir -p artifacts/iter-N` to before `invoke_provider` in loop.sh and loop.ps1
- [x] Add `mkdir -p artifacts/baselines` at session init in loop.sh and loop.ps1
- [x] Add proof-manifest existence check + log entries (proof_manifest_found / proof_manifest_missing) in both scripts — main path and queue_override path
- [x] Expand subagent-hints-proof.md with vision-model delegation examples referencing vision-reviewer
- [x] Remove JSON parsing / manifest validation logic from loop scripts (existence-only check)
- [x] Update loop.tests.ps1: delete Validate-ProofManifest block, replace stale proof_manifest_validated assertions with proof_manifest_found/missing, add dedicated coverage for new events
- [x] [review] Gate 4: Remove dead `proof-invalid-manifest` branches from fake providers in loop.tests.ps1 (11700aae2)
- [x] [qa/P1] Fix queue_override: add placeholder substitution + proof_manifest events to queue_override proof iterations in loop.sh and loop.ps1 (f58478938)
- [x] [qa/P2] Fix monitor: prevent chain-completion before finalizer finishes (18be430cc)
- [x] Fix spec: correct 9 stale references placing proof in continuous cycle (94604040f)
- [x] [review] Gate 7: Review commits 11700aae2, f58478938, 18be430cc. PASS (2026-03-30):
  - (a) 11700aae2: dead `proof-invalid-manifest` branches cleanly removed (4 lines). CONSTITUTION.md rule #1 hardened. TASK_SPEC.md aligned. ✓
  - (b) f58478938: placeholder substitution + mkdir added to queue_override path in both loop.sh and loop.ps1. proof_manifest_found/missing emitted. 2 regression tests added. ✓
  - (c) 18be430cc: monitor chain-completion now checks finalizerPosition >= finalizer.length. 2 tests added (chain-deferred + chain-fired). ✓
  - (d) All 30 monitor tests PASS. `bash -n loop.sh` PASS. `tsc --noEmit` PASS.
  [reviewed: gates 1-10 pass]
