# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [x] [review] Gate 6: Behavioral QA re-test for `proof_manifest_found`/`proof_manifest_missing` events. PASS (2026-03-29):
  - (a) queue_override proof iteration ran via Pester behavioral test (loop.tests.ps1:3684, 3728)
  - (b) `proof_manifest_found` PASS (manifest present), `proof_manifest_missing` PASS (absent, no iteration_error)
  - (c) `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` verified via proof path matching — PASS
  - (d) `bash -n` on loop.sh PASS (both installed and worktree copies)

### Up Next

- [ ] Review latest commits (11700aae2, f58478938, 18be430cc) — these remove dead code from fake providers, fix queue_override proof path, and fix monitor chain-completion. No review has been run since b99c24992. (priority: high)

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
