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
