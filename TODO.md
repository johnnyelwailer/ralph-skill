# Issue #101: Proof artifact storage, baseline management, and manifest validation

## Current Phase: Implementation

### In Progress

- [x] **P1: loop.ps1 — proof manifest validation function** — Add `Validate-ProofManifest` function equivalent to loop.sh's `validate_proof_manifest()`. Must check file existence and JSON validity. (loop.sh has this at lines 603-622; loop.ps1 has nothing)

- [x] **P1: loop.ps1 — baselines directory creation** — Add `New-Item -ItemType Directory -Force` for `$artifactsDir/baselines` at session init, matching loop.sh line 1964

- [ ] **P1: loop.ps1 — per-iteration artifacts directory creation** — Create `$artifactsDir/iter-$iteration` before provider invocation, matching loop.sh line 2246

- [ ] **P1: loop.ps1 — proof phase post-invocation handling** — After provider returns successfully for proof mode: validate manifest, log `proof_manifest_validated` event, track `$lastProofIteration`, set error on validation failure. Mirror loop.sh lines 2260-2278

- [ ] **P1: loop.ps1 — output capture to artifacts** — Capture provider output to `$artifactsDir/iter-$iteration/output.txt` after each iteration, matching loop.sh lines 2352-2355

### Up Next

- [ ] **P2: loop.sh — baseline update after review approval** — After a successful review iteration, copy latest proof artifacts to `artifacts/baselines/`. SPEC line 601: "After review approval: Current screenshots replace baselines (harness copies them)." Need to find most recent proof iteration's artifacts and copy image files to baselines/

- [ ] **P2: loop.ps1 — baseline update after review approval** — Same baseline update logic for PowerShell, mirroring the loop.sh implementation

- [ ] **P2: loop.sh — proof skip protocol** — When proof manifest has empty `artifacts` array, log the skip reason but don't treat as failure. Currently validation only checks JSON validity, not the skip case. TASK_SPEC deliverable: "if manifest has empty artifacts array, log skip reason but don't treat as failure"

- [ ] **P2: loop.ps1 — proof skip protocol** — Same skip protocol for PowerShell

- [ ] **P3: Expand subagent-hints-proof.md** — Current file is 5 lines listing two subagents with no examples. Needs: vision-model delegation examples, how to use `task` tool to invoke vision-reviewer, reference to `aloop/agents/opencode/vision-reviewer.md` with concrete usage patterns, accessibility-checker invocation examples

### Completed

- [x] loop.sh — ARTIFACTS_DIR variable defined (line 258)
- [x] loop.sh — Template variable resolution for `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` (lines 284-285)
- [x] loop.ps1 — Template variable resolution for `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` (lines 869-870)
- [x] loop.sh — baselines directory creation (line 1964)
- [x] loop.sh — per-iteration artifacts directory creation before proof agent (line 2246)
- [x] loop.sh — validate_proof_manifest function (lines 603-622)
- [x] loop.sh — proof manifest validation after proof phase (lines 2260-2278)
- [x] loop.sh — output capture to artifacts/iter-N/output.txt (lines 2352-2355)
- [x] PROMPT_proof.md — complete with manifest format, skip protocol, template variables
