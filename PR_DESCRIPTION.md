## Summary

Implements proof artifact storage infrastructure for issue #101. An unauthorized scope expansion (cleanup agent added to finalizer, cr_analysis event removed from pipeline.yml) was detected by review and reverted in follow-up commits.

- Moves `mkdir -p artifacts/iter-N` to **before** `invoke_provider` in loop.sh and loop.ps1 (was incorrectly placed after, so the proof agent could not write to it during execution)
- Adds `mkdir -p artifacts/baselines` at session init in both scripts (idempotent, for baseline management)
- Adds proof-manifest existence check + structured log events (`proof_manifest_found` / `proof_manifest_missing`) on both the normal iteration path and the queue_override path — no JSON parsing, existence-only
- Adds placeholder substitution (`{{ARTIFACTS_DIR}}`, `{{ITERATION}}`) to the queue_override path so proof prompts resolve correctly
- Expands `subagent-hints-proof.md` with concrete vision-model delegation examples referencing `vision-reviewer`
- Fixes monitor chain-completion to check `finalizerPosition >= finalizer.length` before SIGTERM, preventing premature session completion when finalizer has remaining steps

## Files Changed

- `aloop/bin/loop.sh` — move iter-N mkdir before invoke_provider; add baselines mkdir at init; add proof-manifest existence check + log events; add placeholder substitution + all of the above to queue_override path
- `aloop/bin/loop.ps1` — equivalent changes (parallel implementation)
- `aloop/bin/loop.tests.ps1` — delete Validate-ProofManifest block; replace stale proof_manifest_validated assertions with proof_manifest_found/missing; add 2 Pester regression tests for queue_override proof manifest events; remove dead proof-invalid-manifest branches from fake providers
- `aloop/bin/loop_branch_coverage.tests.sh` — extract `substitute_prompt_placeholders` + declare ARTIFACTS_DIR/LAST_PROOF_ITERATION stubs for branch-coverage harness
- `aloop/cli/src/lib/monitor.ts` — fix chain-completion guard: require `finalizerPosition >= finalizer.length`
- `aloop/cli/src/lib/monitor.test.ts` — 2 new tests: chain-deferred (finalizerPosition 0 of 6 → running) and chain-fired (finalizerPosition 6 of 6 → completed)
- `aloop/templates/subagent-hints-proof.md` — expand with vision-model delegation examples, {{ARTIFACTS_DIR}}/{{ITERATION}} usage patterns
- `CONSTITUTION.md` — harden rule #1 (loop scripts must shrink, never grow — this issue is the last authorized addition)
- `SPEC.md` — correct 9 stale references placing proof in continuous cycle
- `.aloop/pipeline.yml` — reverted unauthorized removal of cr_analysis event; reverted unauthorized addition of PROMPT_cleanup.md to finalizer
- `aloop/templates/PROMPT_cleanup.md` — deleted (unauthorized addition, out of scope)

## Verification

- [x] `artifacts/iter-N/` exists before `invoke_provider` for proof iteration (loop.sh and loop.ps1) — verified by timestamp evidence: iter-94 dir created 36s before output.txt written
- [x] `artifacts/baselines/` exists at session init in both scripts — verified behaviorally: `aloop start` session shows baselines/ dir
- [x] After proof iteration, log writes `proof_manifest_found` or `proof_manifest_missing`; missing does NOT fail the iteration — verified by Pester queue_override tests (2/2 PASS) and real-session evidence in issue-176 log.jsonl
- [x] `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` resolve correctly in proof prompt — verified: Pester fake provider extracts correct iter number from resolved prompt; proof-manifest.json found at expected ARTIFACTS_DIR path
- [x] `subagent-hints-proof.md` has concrete vision-reviewer delegation examples — verified by file inspection
- [x] No JSON parsing in loop.sh or loop.ps1 — verified: proof_manifest events fired without JSON error; existence-only
- [x] No baseline promotion logic in loop.sh or loop.ps1 — verified: no such code exists
- [x] `bash -n loop.sh` passes — verified: both installed and worktree copies exit 0
- [x] loop.ps1 syntax check passes — verified: PowerShell parser reports 0 parse errors

## Proof Artifacts

- Behavioral QA evidence in QA_LOG.md (3 sessions): Pester queue_override tests (2/2), real-session proof_manifest_found event, timestamp evidence
- Branch-coverage harness: 52/52 branches (100%)
- `npm test`: 1092/1125 pass (33 pre-existing failures, none in modified files); `tsc --noEmit` clean
