# QA Log

## QA Session — 2026-03-22 (issue #101: Proof artifact storage)

### Binary Under Test
- Binary: `/tmp/aloop-test-install-CKicjw/bin/aloop` (npm pack install)
- Version: 1.0.0

### Test Environment
- Temp dir 1: `/tmp/qa-test-proof-1774180209` (all tasks done scenario)
- Temp dir 2: `/tmp/qa-test-proof2-1774180274` (tasks pending scenario)
- Features tested: 5 (2 PASS, 2 FAIL, 1 BLOCKED)

### Results
- PASS: Per-iteration artifacts directory creation
- PASS: Provider output capture to artifacts/iter-N/output.txt
- FAIL: Template variable resolution in PROMPT_proof.md (bug filed)
- FAIL: Baseline directory not created (bug filed)
- BLOCKED: Proof manifest validation (finalizer empty, proof never runs)

### Bugs Filed
- [qa/P1] Template variables {{ARTIFACTS_DIR}} and {{ITERATION}} not resolved in PROMPT_proof.md
- [qa/P1] No artifacts/baselines/ directory created per-session

### Command Transcript

#### Test 1: All tasks already done (session 1)
```
$ aloop scaffold  # exit 0
$ aloop start --provider claude --max-iterations 3  # exit 0
  Session: qa-test-proof-1774180209-20260322-115024
```
- status.json: `{"iteration":1,"phase":"plan","state":"completed"}`
- Loop detected all tasks done, finalizer was empty (`"finalizer": []`), exited immediately
- No artifacts directory created (no iterations ran)
- loop-plan.json: `"allTasksMarkedDone": true, "finalizer": []`

#### Test 2: Tasks pending (session 2)
```
$ aloop scaffold  # exit 0
$ aloop start --provider claude --max-iterations 2  # exit 0
  Session: qa-test-proof2-1774180274-20260322-115124
```
- Iteration 1 (plan): artifacts/iter-1/output.txt created (273 bytes)
- Iteration 2 (build): artifacts/iter-2/output.txt created (132 bytes)
- status.json: `{"iteration":2,"phase":"build","state":"stopped"}` (hit max iterations)
- loop-plan.json: `"finalizer": []` — finalizer still empty
- No baselines/ directory created

#### Test 3: Template variable check
```
$ grep '{{ARTIFACTS_DIR}}\|{{ITERATION}}' prompts/PROMPT_proof.md
  Line 59: Save all artifacts to `{{ARTIFACTS_DIR}}/iter-{{ITERATION}}/`
  Line 61: If previous baselines exist in `{{ARTIFACTS_DIR}}/baselines/`, diff against them
  Line 75: Write `proof-manifest.json` to `{{ARTIFACTS_DIR}}/iter-{{ITERATION}}/`
```
- Template variables remain as raw `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` in the compiled prompt
- These should be resolved to actual session paths before the proof agent runs

#### Test 4: Subagent hints
```
$ cat subagent-hints-proof.md
  ## Available Subagents
  - **vision-reviewer** — analyzes screenshots for layout/visual issues
  - **accessibility-checker** — WCAG compliance checks on screenshots
```
- File exists but only has 4 lines
- No delegation examples as requested by TASK_SPEC

### Cleanup
- Deleted temp dirs and killed loop processes
- Removed npm test-install prefix

## QA Re-Verification — 2026-03-22 (Gate 10 follow-up)

### Scope
- Re-test proof-related features after proof skip protocol landed:
  - proof manifest validation
  - proof skip protocol (empty artifacts)
  - runtime placeholder substitution (`{{ARTIFACTS_DIR}}`, `{{ITERATION}}`)
  - baselines directory creation
  - subagent hints status

### Runtime QA Scenarios

#### Runtime Test A: `loop.ps1` proof finalizer path
```
$ ALOOP_NO_DASHBOARD=1 pwsh -File aloop/bin/loop.ps1 \
    -PromptsDir /home/pj/tmp/qa-runtime-ps1/prompts \
    -SessionDir /home/pj/tmp/qa-runtime-ps1/session \
    -WorkDir /home/pj/tmp/qa-runtime-ps1/work \
    -Provider claude -MaxIterations 1
```
- `log.jsonl` contains:
  - `event=proof_skipped`
  - `reason=internal_plumbing_no_ui`
  - `event=iteration_complete` with `mode=proof`
- Captured prompt passed to provider resolved placeholders:
  - `Save all artifacts to /home/pj/tmp/qa-runtime-ps1/session/artifacts/iter-1/`
  - no raw `{{ARTIFACTS_DIR}}` / `{{ITERATION}}` tokens remained.
- `artifacts/baselines/` exists in session dir.

#### Runtime Test B: `loop.sh` proof finalizer path
```
$ bash aloop/bin/loop.sh \
    --prompts-dir /home/pj/tmp/qa-runtime-sh/prompts \
    --session-dir /home/pj/tmp/qa-runtime-sh/session \
    --work-dir /home/pj/tmp/qa-runtime-sh/work \
    --provider claude --max-iterations 1
```
- `log.jsonl` contains:
  - `event=proof_skipped`
  - `reason=internal_plumbing_no_ui`
  - `event=iteration_complete` with `mode=proof`
- Captured prompt passed to provider resolved placeholders:
  - `Save all artifacts to /home/pj/tmp/qa-runtime-sh/session/artifacts/iter-1/`
  - no raw `{{ARTIFACTS_DIR}}` / `{{ITERATION}}` tokens remained.
- `artifacts/baselines/` exists in session dir.

### Focused Test Runs

#### Proof manifest validation tests (`proof-manifest-validation` tag)
```
$ Invoke-Pester -Path ./aloop/bin/loop.tests.ps1 -Tag proof-manifest-validation
```
- Result: **PASS (4/4)**
  - `loop.ps1 — Validate-ProofManifest` (empty + whitespace invalid JSON)
  - `loop.ps1 — Register-IterationFailure proof mode`
  - `loop.sh — register_iteration_failure proof mode`

#### Proof manifest behavioral tests (subset)
```
$ Invoke-Pester -Path ./aloop/bin/loop.tests.ps1 -FullNameFilter \
  "loop.sh — final-review behavioral end-to-end.proof manifest validation logs valid manifest details",\
  "loop.sh — final-review behavioral end-to-end.proof manifest validation fails proof iteration when JSON is invalid"
```
- Result: **PASS (2/2)**

### Findings
- Previous QA FAIL for placeholder substitution was a methodology issue (checked static template instead of runtime prompt).
- Previous QA FAIL for baselines directory creation is not reproducible in runtime re-test.
- Proof-phase features are now testable through finalizer-triggered proof iteration; skip protocol logs correctly and does not fail iteration.
- Subagent hints expansion is still outstanding and remains the only unresolved proof-related feature in QA coverage.
