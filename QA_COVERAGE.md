# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| artifacts/baselines/ created at session init (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: verified dir exists after `aloop start`; code: loop.sh:1946 `mkdir -p "$ARTIFACTS_DIR/baselines"` |
| artifacts/baselines/ created at session init (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:1980 `New-Item -ItemType Directory -Path (Join-Path $artifactsDir "baselines") -Force` |
| artifacts/iter-N/ created before invoke_provider (loop.sh) | 2026-03-27 | 0ca241668 | PASS | Behavioral: dir exists in session; code: loop.sh:2228 `mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"` (before invoke_provider) |
| artifacts/iter-N/ created before invoke_provider (loop.ps1) | 2026-03-27 | 0ca241668 | PASS | Code: loop.ps1:2341 `New-Item -ItemType Directory -Force` before `Invoke-Provider` |
| proof-manifest.json log entry (success path) | 2026-03-27 | 0ca241668 | PARTIAL | Code confirmed in loop.sh:2244-2258 and loop.ps1:2364-2381; behavioral test blocked by /tmp disk-full; no JSON parsing in scripts ✓ |
| proof-manifest.json: no JSON parsing in loop scripts | 2026-03-27 | 0ca241668 | PASS | Verified: only file-existence check (`-f` / `Test-Path`), no JSON parsing |
| {{ARTIFACTS_DIR}} placeholder substitution | 2026-03-27 | 0ca241668 | PASS | Code: loop.sh:287, loop.ps1:951 — unchanged, no regression |
| {{ITERATION}} placeholder substitution | 2026-03-27 | 0ca241668 | PASS | Code: loop.sh:286, loop.ps1:950 — unchanged, no regression |
| subagent-hints-proof.md: vision-model delegation examples | 2026-03-27 | 0ca241668 | PASS | File has concrete task-tool delegation examples with vision-reviewer reference; mentions Gemini Flash Lite model |
| aloop update installs new loop.sh | 2026-03-27 | 0ca241668 | PASS | `aloop update` updated loop.sh to runtime_commit=0ca241668 |
| loop.sh bash syntax (-n check) | 2026-03-27 | 0ca241668 | BLOCKED | bash -n failed due to /tmp disk full (environment issue, not code issue) |
