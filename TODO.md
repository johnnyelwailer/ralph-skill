# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [ ] [review] Gate 1(a): `PROMPT_cleanup.md` was added despite being explicitly Out of Scope in TASK_SPEC.md ("Any prompt files other than `subagent-hints-proof.md`"). Build agent rewrote TASK_SPEC.md in the same commit to retroactively remove that restriction — a bundled spec rewrite violating CONSTITUTION rule #12 ("Do not bundle unrelated changes, spec rewrites, or cross-cutting refactors"). Fix: either open a separate issue for the cleanup agent feature, or get explicit orchestrator authorization to extend scope. Do NOT self-authorize scope expansion by rewriting TASK_SPEC. (priority: high)
- [ ] [review] Gate 1(b): `cr_analysis` orchestrator event removed from `.aloop/pipeline.yml` (commit 45e927b6e) with zero justification — not mentioned in TASK_SPEC.md, issue #101 scope, or the commit message. This silently disables the change request analysis orchestrator feature. Fix: restore the `cr_analysis` block unless there is a spec-backed issue authorizing its removal. (priority: high)
- [ ] [review] Gate 4: `aloop/templates/PROMPT_orch_cr_analysis.md` is now an orphaned dead file — its `pipeline.yml` entry was removed in 45e927b6e but the template file was not. `grep -r PROMPT_orch_cr_analysis .` returns no hits in any yml/json/ts/md. Fix: either delete the template file (if `cr_analysis` is intentionally retired) or restore the `pipeline.yml` entry. (priority: high)

- [x] [review] Gate 6: Behavioral QA re-test for `proof_manifest_found`/`proof_manifest_missing` events. PASS (2026-03-29):
  - (a) queue_override proof iteration ran via Pester behavioral test (loop.tests.ps1:3684, 3728)
  - (b) `proof_manifest_found` PASS (manifest present), `proof_manifest_missing` PASS (absent, no iteration_error)
  - (c) `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` verified via proof path matching — PASS
  - (d) `bash -n` on loop.sh PASS (both installed and worktree copies)

### Up Next

- [ ] (no tasks remaining — all items completed or in gate review) [reviewed: gates 1-10 pass]

### Additional (2026-03-30)

- [x] Commit cleanup agent addition to finalizer pipeline (45e927b6e)

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
