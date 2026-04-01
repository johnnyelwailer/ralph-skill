# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| artifacts/baselines/ created at session init (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: verified dir exists after `aloop start`; code: loop.sh:1946 `mkdir -p "$ARTIFACTS_DIR/baselines"` |
| artifacts/baselines/ created at session init (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:1980 `New-Item -ItemType Directory -Path (Join-Path $artifactsDir "baselines") -Force` |
| artifacts/iter-N/ created before invoke_provider (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: dir exists in session; code: loop.sh:2228 `mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"` (before invoke_provider) |
| artifacts/iter-N/ created before invoke_provider (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:2341 `New-Item -ItemType Directory -Force` before `Invoke-Provider` |
| proof-manifest.json log entry (success path) | 2026-03-29 | f58478938 | PASS | Behavioral: Pester queue_override test — fake provider writes proof-manifest.json, `proof_manifest_found` event logged (loop.tests.ps1:3684); 1/1 pass |
| proof-manifest.json: missing path (no iteration_error) | 2026-03-29 | f58478938 | PASS | Behavioral: Pester queue_override test — fake provider omits manifest, `proof_manifest_missing` event logged, zero `iteration_error` events (loop.tests.ps1:3728); 1/1 pass |
| proof-manifest.json: no JSON parsing in loop scripts | 2026-03-29 | f58478938 | PASS | Behavioral: proof_manifest_found/missing events fired without any JSON parsing error — existence-only check confirmed |
| {{ARTIFACTS_DIR}} placeholder substitution | 2026-03-29 | f58478938 | PASS | Behavioral: proof-manifest.json written to ARTIFACTS_DIR path was found by loop's existence check — correct path resolution confirmed |
| {{ITERATION}} placeholder substitution | 2026-03-29 | f58478938 | PASS | Behavioral: Pester queue_override test prompt contains `iter-{{ITERATION}}`; fake provider extracts iter number from resolved prompt — substitution confirmed |
| subagent-hints-proof.md: vision-model delegation examples | 2026-03-27 | 0ca241668 | PASS | File has concrete task-tool delegation examples with vision-reviewer reference; mentions Gemini Flash Lite model |
| aloop update installs new loop.sh | 2026-03-29 | f58478938 | PASS | Behavioral: `aloop update` output showed "Version: f58478938" — no source inspection |
| loop.sh bash syntax (-n check) | 2026-03-29 | f58478938 | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` and worktree copy both exit 0 — syntax clean |
| artifacts/iter-N/ directories created (behavioral) | 2026-03-27 | 94604040f | PASS | Behavioral: Glob on issue-101 session confirmed iter-1/ through iter-21/ exist with output.txt — no source inspection |
| pipeline.yml finalizer compilation | 2026-03-27 | 94604040f | PASS | Behavioral: .aloop/pipeline.yml with finalizer:[PROMPT_proof.md] compiled to loop-plan.json correctly |
| allTasksMarkedDone=true at startup bypasses finalizer | 2026-03-30 | 18be430cc | PASS | Fixed by 18be430cc: monitor chain-completion now checks finalizerPosition >= finalizer.length before SIGTERM. Evidence: qa-proof-events session (runtime 18be430cc) ran full finalizer (iters 3–8: spec-gap, docs, spec-review, final-review, final-qa, proof) after tasks_marked_complete at iter 2. |
| loop.ps1 syntax check (PowerShell parser) | 2026-03-30 | 71cea7d88 | PASS | Behavioral: PowerShell parser reports 0 parse errors for loop.ps1 — syntax clean |
| branch-coverage harness for substitute_prompt_placeholders | 2026-03-30 | b70caeaec | PASS | Behavioral: `loop_branch_coverage.tests.sh` ran 52/52 branches — 100% coverage, all queue tests pass |
| proof_manifest_found (main path, real aloop session) | 2026-03-30 | f58478938 | PASS | Behavioral: issue-176 session log.jsonl contains `proof_manifest_found` event at iter-94 with correct path — not just queue_override path |
| artifacts/iter-N/ created before invoke_provider (timestamp) | 2026-03-30 | f58478938 | PASS | Behavioral: issue-176 iter-94 dir created at 17:13:54, output.txt written at 17:14:30 (+36s) — dir pre-dated provider invocation |
| Full acceptance criteria re-verify (post-gate-10) | 2026-03-30 | 1e00f2d3e | PASS | All 9 acceptance criteria verified: baselines init, iter-N pre-creation, proof_manifest_found/missing events, placeholder substitution, vision hints, no JSON parsing, no baseline promotion, bash -n PASS, ps1 syntax PASS |
| PROMPT_cleanup.md in finalizer pipeline | 2026-03-30 | 45e927b6e | PASS | Behavioral: pipeline.yml compiled to loop-plan.json with finalizer=['PROMPT_spec-gap.md','PROMPT_proof.md','PROMPT_cleanup.md'] — cleanup is last step |
| cleanup agent: untrack working artifacts (--cached only) | 2026-03-30 | 45e927b6e | PASS | Behavioral: simulated cleanup in isolated test repo — TODO.md, STEERING.md, TASK_SPEC.md, QA_LOG.md, QA_COVERAGE.md, RESEARCH.md untracked; files still on disk; main.ts + src/index.ts remain tracked |
| RESEARCH.md in .gitignore | 2026-03-30 | 45e927b6e | PASS | .gitignore line 59: RESEARCH.md — working artifact correctly excluded |
| loop.sh bash syntax (-n check) at 45e927b6e | 2026-03-30 | 45e927b6e | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` exits 0 — no regressions from cleanup agent addition |
| branch-coverage harness at 45e927b6e | 2026-03-30 | 45e927b6e | PASS | `loop_branch_coverage.tests.sh` 52/52 branches — no regressions |
| queue_override proof Pester tests at 45e927b6e | 2026-03-30 | 45e927b6e | PASS | Pester: Tests Passed: 2, Failed: 0 — proof_manifest_found + proof_manifest_missing still pass |
| PROMPT_cleanup.md removed from pipeline.yml finalizer (Gate 1a) | 2026-03-30 | 3fbde7967 | PASS | Behavioral: pipeline.yml finalizer has 6 entries [spec-gap, docs, spec-review, final-review, final-qa, proof] — no cleanup entry; loop-plan.json compiled without cleanup.md; no PROMPT_cleanup refs in .aloop/ |
| PROMPT_cleanup.md template deleted from worktree | 2026-03-30 | 3fbde7967 | PASS | Behavioral: `ls aloop/templates/PROMPT_cleanup.md` → No such file — file deleted as required |
| cr_analysis event block restored in pipeline.yml (Gates 1b+4) | 2026-03-30 | 46367b742 | PASS | Behavioral: pipeline.yml orchestrator_events.cr_analysis block present with correct fields (prompt, batch, filter, result_pattern); PROMPT_orch_cr_analysis.md exists; orchestrate --plan-only exits 0 without parse errors |
| loop.sh bash syntax (-n check) at 3fbde7967 | 2026-03-30 | 3fbde7967 | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` exits 0 — no regressions from fix commits |
| queue_override proof Pester tests at 3fbde7967 | 2026-03-30 | 3fbde7967 | PASS | Pester: Tests Passed: 2, Failed: 0 — proof_manifest_found + proof_manifest_missing still pass after Gate 1a/1b fixes |
| pipeline.yml finalizer — no PROMPT_cleanup.md (at 817980bdd) | 2026-03-30 | 817980bdd | PASS | Behavioral: finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry; no PROMPT_cleanup refs in .aloop/ |
| pipeline.yml cr_analysis block present (at 817980bdd) | 2026-03-30 | 817980bdd | PASS | Behavioral: cr_analysis block has all required fields (prompt, batch, filter, result_pattern); PROMPT_orch_cr_analysis.md exists |
| orchestrate --plan-only exits 0 (at 817980bdd) | 2026-03-30 | 817980bdd | PASS | Behavioral: orchestrate --plan-only exits 0 — pipeline.yml parses without error including cr_analysis block |
| loop-plan.json finalizer — no PROMPT_cleanup.md (at 817980bdd) | 2026-03-30 | 817980bdd | PASS | Behavioral: host issue session loop-plan.json finalizer=['spec-gap','docs','spec-review','final-review','final-qa','proof'] — 6 entries, no cleanup |
| loop.sh bash syntax (-n check) at 817980bdd | 2026-03-30 | 817980bdd | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` and worktree copy both exit 0 |
| queue_override proof Pester tests at 817980bdd | 2026-03-30 | 817980bdd | PASS | Pester: Tests Passed: 2, Failed: 0 — proof_manifest_found + proof_manifest_missing pass at final review-approved state |
| proof_manifest_found/missing code in loop.sh (at 817980bdd) | 2026-03-30 | 817980bdd | PASS | Behavioral: loop.sh lines 2085,2090,2264,2269 emit proof_manifest_found/missing events — both main path and queue_override path covered |
| loop.sh bash syntax (-n check) at 8dae43991 | 2026-04-01 | 8dae43991 | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` and worktree copy both exit 0 — no regressions from final TODO.md/doc updates |
| loop.ps1 syntax check (PowerShell parser) at 8dae43991 | 2026-04-01 | 8dae43991 | PASS | PowerShell parser reports 0 parse errors — syntax clean at HEAD |
| orchestrate --plan-only exits 0 (at 8dae43991) | 2026-04-01 | 8dae43991 | PASS | pipeline.yml (including cr_analysis block, 6-entry finalizer) parses without error; exit 0 |
| pipeline.yml finalizer — no PROMPT_cleanup.md (at 8dae43991) | 2026-04-01 | 8dae43991 | PASS | finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup; PROMPT_cleanup.md deleted |
| loop.sh bash syntax (-n check) at e647545e0 | 2026-04-01 | e647545e0 | PASS | `bash -n` on installed + worktree copies — exit 0; no regressions from review commit |
| loop.ps1 syntax check (PowerShell parser) at e647545e0 | 2026-04-01 | e647545e0 | PASS | PowerShell parser reports 0 parse errors at final HEAD |
| proof_manifest_found/missing in loop.sh at e647545e0 | 2026-04-01 | e647545e0 | PASS | 4 event emissions: lines 2085,2090 (main path) + 2264,2269 (queue_override) — still present |
| pipeline.yml finalizer — no PROMPT_cleanup.md (at e647545e0) | 2026-04-01 | e647545e0 | PASS | finalizer=[spec-gap,docs,spec-review,final-review,final-qa,proof]; grep "cleanup" exits 1 |
| pipeline.yml cr_analysis block present (at e647545e0) | 2026-04-01 | e647545e0 | PASS | cr_analysis block with all required fields; PROMPT_orch_cr_analysis.md exists |
| orchestrate --plan-only exits 0 (at e647545e0) | 2026-04-01 | e647545e0 | PASS | Session initialized, exit 0 in isolated temp dir — no regressions |
| aloop update at e647545e0 | 2026-04-01 | e647545e0 | PASS | `aloop update` output: "Version: e647545e0, Files updated: 57" — installed binary matches HEAD |
| pipeline.yml finalizer — no PROMPT_cleanup.md (at c4380e7cf) | 2026-03-30 | c4380e7cf | PASS | Behavioral: finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry; grep for "cleanup" exits 1 |
| pipeline.yml cr_analysis block present (at c4380e7cf) | 2026-03-30 | c4380e7cf | PASS | Behavioral: cr_analysis block has all required fields (prompt, batch, filter, result_pattern); PROMPT_orch_cr_analysis.md exists |
| orchestrate --plan-only exits 0 (at c4380e7cf) | 2026-03-30 | c4380e7cf | PASS | Behavioral: orchestrate --plan-only exits 0 — pipeline.yml (including cr_analysis block) parses without error |
| loop.sh bash syntax (-n check) at c4380e7cf | 2026-03-30 | c4380e7cf | PASS | `bash -n /home/pj/.aloop/bin/loop.sh` and worktree copy both exit 0 |
| queue_override proof Pester tests at c4380e7cf | 2026-03-30 | c4380e7cf | PASS | Pester: Tests Passed: 2, Failed: 0 — proof_manifest_found + proof_manifest_missing pass at final HEAD |
