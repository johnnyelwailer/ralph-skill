# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| artifacts/baselines/ created at session init (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: verified dir exists after `aloop start`; code: loop.sh:1946 `mkdir -p "$ARTIFACTS_DIR/baselines"` |
| artifacts/baselines/ created at session init (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:1980 `New-Item -ItemType Directory -Path (Join-Path $artifactsDir "baselines") -Force` |
| artifacts/iter-N/ created before invoke_provider (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: dir exists in session; code: loop.sh:2228 `mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"` (before invoke_provider) |
| artifacts/iter-N/ created before invoke_provider (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:2341 `New-Item -ItemType Directory -Force` before `Invoke-Provider` |
| proof-manifest.json log entry (success path) | 2026-03-27 | 94604040f | BLOCKED | Behavioral test blocked by /tmp disk-full (SIGABRT exit 134) — proof phase not reachable; source inspection used in iter-1 is invalid per rule 16 |
| proof-manifest.json: missing path (no iteration_error) | 2026-03-27 | 94604040f | BLOCKED | Same blocker — proof_manifest_missing event not verified behaviorally yet |
| proof-manifest.json: no JSON parsing in loop scripts | 2026-03-27 | 0ca241668 | PARTIAL | Source inspection in iter-1 (invalid per rule 16); behavioral test pending proof-phase execution |
| {{ARTIFACTS_DIR}} placeholder substitution | 2026-03-27 | 0ca241668 | PARTIAL | Verified via source inspection (iter-1, invalid per rule 16); behavioral verification pending |
| {{ITERATION}} placeholder substitution | 2026-03-27 | 0ca241668 | PARTIAL | Verified via source inspection (iter-1, invalid per rule 16); behavioral verification pending |
| subagent-hints-proof.md: vision-model delegation examples | 2026-03-27 | 0ca241668 | PASS | File has concrete task-tool delegation examples with vision-reviewer reference; mentions Gemini Flash Lite model |
| aloop update installs new loop.sh | 2026-03-27 | 94604040f | PASS | Behavioral: `aloop update` output showed "Version: 94604040f" — no source inspection |
| loop.sh bash syntax (-n check) | 2026-03-27 | 0ca241668 | BLOCKED | bash -n failed due to /tmp disk full (environment issue, not code issue) |
| artifacts/iter-N/ directories created (behavioral) | 2026-03-27 | 94604040f | PASS | Behavioral: Glob on issue-101 session confirmed iter-1/ through iter-21/ exist with output.txt — no source inspection |
| pipeline.yml finalizer compilation | 2026-03-27 | 94604040f | PASS | Behavioral: .aloop/pipeline.yml with finalizer:[PROMPT_proof.md] compiled to loop-plan.json correctly |
| allTasksMarkedDone=true at startup bypasses finalizer | 2026-03-27 | 94604040f | FAIL | Bug: when TODO.md has all tasks done at session start, loop exits immediately as "completed" without running finalizer — proof phase never runs. Filed as [qa/P2]. |
