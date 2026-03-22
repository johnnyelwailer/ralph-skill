# Issue #101: Proof artifact storage, baseline management, and manifest validation

## Current Phase: Implementation

### Review Findings (highest priority)

- [x] [review] Gate 4: `loop.sh:2352` — `mkdir -p "$SESSION_DIR/artifacts/iter-$ITERATION"` is now redundant with `loop.sh:2246` `mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"` (same path via `ARTIFACTS_DIR="$SESSION_DIR/artifacts"`). Remove the duplicate at line 2352. (priority: high)
- [x] [review] Gate 9: `aloop/templates/instructions/review.md:24` — section heading still reads `## The 9 Gates` but there are now 10 gates. Update to `## The 10 Gates`. (priority: high)

### In Progress

- [ ] [qa/P1] **Validate-ProofManifest accepts empty file** — `ConvertFrom-Json` on empty string returns `$null` without error, so empty files pass validation. Add an explicit empty/whitespace-only check before JSON parsing. Fix this BEFORE wiring up post-invocation handling. (`loop.ps1:881-898`) (priority: high)

- [ ] **P1: loop.ps1 — proof phase post-invocation handling** — After provider returns successfully for proof mode: validate manifest at `$artifactsDir/iter-$iteration/proof-manifest.json`, log `proof_manifest_validated` event, track `$script:lastProofIteration`, call `Register-IterationFailure` on validation failure. Mirror loop.sh lines 2260-2278. (`loop.ps1` post-provider section ~line 2196+) (priority: high)

- [ ] **P1: loop.ps1 — output capture to artifacts** — Record raw log offset before provider invocation, then extract delta to `$artifactsDir/iter-$iteration/output.txt` after. Mirror loop.sh lines 2351-2356 approach (offset-based extraction from raw log). (`loop.ps1` ~line 2188+) (priority: high)

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
- [x] loop.ps1 — Validate-ProofManifest function (lines 881-898, has empty-file bug)
- [x] loop.ps1 — baselines directory creation at session init
- [x] loop.ps1 — per-iteration artifacts directory creation (line 2188)
