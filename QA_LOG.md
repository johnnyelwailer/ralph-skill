# QA Log

## QA Session — 2026-03-27 (iteration 1, issue #101)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-lYZdrD/bin/aloop` (1.0.0, built from commit `0ca241668`)
- `aloop update` applied to refresh `~/.aloop/bin/loop.sh` to `0ca241668`
- Test dirs: `/tmp/qa-test-issue101-*`, `/tmp/qa-test-proof-*`, `/tmp/qa-proof-direct-*`, `/tmp/qa-proof-run-*`
- Features tested: 5 (artifacts/baselines init, artifacts/iter-N pre-creation, proof-manifest logging code, placeholder substitution, subagent-hints-proof.md)
- Environment issue: `/tmp` filesystem (13GB) completely full due to 30k+ pre-existing `aloop-*` test fixture dirs and 2.4k `.so` files from prior test runs. This blocked shell execution (bash SIGABRT) in later tests.

### Results

- PASS: `artifacts/baselines/` created at session init (both loop.sh and loop.ps1)
- PASS: `artifacts/iter-N/` created before `invoke_provider` call (both scripts)
- PASS: `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` placeholder substitution (no regression)
- PASS: `subagent-hints-proof.md` has concrete vision-reviewer delegation examples
- PASS: No JSON parsing added to loop.sh or loop.ps1 (only file-existence checks)
- PARTIAL: `proof-manifest.json` log entry code exists but behavioral test blocked by disk-full

### Bugs Filed
None — no new bugs. One environmental issue noted.

### Command Transcript

```
# Install packaged CLI
npm --prefix aloop/cli run test-install -- --keep
# Output: Binary: /tmp/aloop-test-install-lYZdrD/bin/aloop (1.0.0)

# Update system runtime
ALOOP_BIN=/tmp/aloop-test-install-lYZdrD/bin/aloop
$ALOOP_BIN update
# Output: Updated ~/.aloop from worktree — Version: 0ca241668 — Files updated: 107

# Verify artifacts/baselines in loop.sh:
grep -n "# Create artifacts baselines" /home/pj/.aloop/bin/loop.sh
# Output: 1945: # Create artifacts baselines directory for proof agent diffing
# Line 1946: mkdir -p "$ARTIFACTS_DIR/baselines"

# Verify artifacts/iter-N before invoke_provider in loop.sh:
sed -n '2224,2235p' /home/pj/.aloop/bin/loop.sh
# Output:
#    # Create per-iteration artifacts directory before provider invocation
#    mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"
#    # Invoke provider

# Behavioral test — start session with stub claude:
$ALOOP_BIN start --provider claude --max-iterations 2
# Session: qa-test-proof-1774613024-20260327-120427
# Log events: session_start, frontmatter_applied, iteration_complete mode=plan,
#             phase_prerequisite_miss, frontmatter_applied, iteration_complete mode=build, limit_reached
# Artifacts: baselines/ ← PASS, iter-1/, iter-2/ ← PASS

# Verify proof-manifest code (loop.sh):
sed -n '2244,2258p' /home/pj/.aloop/bin/loop.sh
# Output: if [ "$iter_mode" = "proof" ]; then ... checks proof-manifest.json existence
#         writes proof_manifest_found OR proof_manifest_missing log entry
#         no JSON parsing

# Verify proof-manifest code (loop.ps1):
sed -n '2364,2381p' /home/pj/.aloop/bin/loop.ps1
# Output: if ($iterationMode -eq 'proof') { Test-Path $proofManifestPath ... }
#         no JSON parsing

# Verify placeholder substitution (loop.sh):
sed -n '283,292p' /home/pj/.aloop/bin/loop.sh
# Output: substitute_prompt_placeholders function
#         line 286: ITERATION substitution
#         line 287: ARTIFACTS_DIR substitution — UNCHANGED

# Read subagent-hints-proof.md:
# Content: Has concrete task-tool delegation examples for vision-reviewer
#          Mentions Gemini Flash Lite model (matches vision-reviewer.md frontmatter model)
#          Includes {{ARTIFACTS_DIR}}/{{ITERATION}} template usage example

# Disk issue discovered:
df -h /tmp → 13G 13G 4.0K 100%
# 30,728 aloop-* test fixture dirs + 2,386 .so files (4.4MB each) from prior test runs
# Cleanup of test dirs only freed ~13MB (most space in .so files)
# bash SIGABRT (exit 134) on any command writing to /tmp
# Blocked: bash -n syntax check, proof-phase behavioral run
```

### Environmental Issue

`/tmp` filesystem (tmpfs, 13GB) is at 100% capacity due to pre-existing test artifacts:
- ~30,000 `aloop-*` test fixture directories
- ~2,386 `.so` files (4.4MB each, ~10.5GB total) — likely V8 JIT code caches from prior node processes

**Impact**: `bash -n` syntax check could not run. Proof-phase behavioral test could not run (loop.sh crashed mid-execution). This is NOT related to issue-101 changes.

**Mitigation**: Key behaviors verified via code inspection of installed `loop.sh` and `loop.ps1` (post `aloop update`). Behavioral tests for artifacts/baselines and iter-N creation completed before disk reached critical state.
