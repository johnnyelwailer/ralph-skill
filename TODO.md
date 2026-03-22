# Issue #101: Proof artifact storage, baseline management, and manifest validation

## Current Phase: Implementation

### Review Findings (highest priority)

- [x] [review] Gate 4: `loop.sh:2352` — `mkdir -p "$SESSION_DIR/artifacts/iter-$ITERATION"` is now redundant with `loop.sh:2246` `mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"` (same path via `ARTIFACTS_DIR="$SESSION_DIR/artifacts"`). Remove the duplicate at line 2352. (priority: high) [reviewed: resolved in edd0ff4]
- [x] [review] Gate 9: `aloop/templates/instructions/review.md:24` — section heading still reads `## The 9 Gates` but there are now 10 gates. Update to `## The 10 Gates`. (priority: high) [reviewed: resolved in edd0ff4, gates 1-10 pass]

### In Progress

- [x] [qa/P1] **Validate-ProofManifest accepts empty file** — Added explicit `IsNullOrWhiteSpace` guard before `ConvertFrom-Json` so empty and whitespace-only manifests fail validation with `invalid_json`. Added tagged Pester coverage in `loop.tests.ps1` (`loop.ps1:881-902`). (priority: high) [reviewed: regression tests pass]

- [x] [qa/P1] **README says "9 gates" but review template has 10** — README.md references "9 quality gates" in 4 places (lines 13, 73, 185, 213) and the gate table (line 75) only lists 9 gates. The review template (`instructions/review.md`) correctly says 10 gates (Gate 10: QA Coverage & Bug Fix Rate). Update README to say 10 gates and add Gate 10 to the table. Tested at iter 17. (priority: high)

- [x] **P1: loop.ps1 — proof phase post-invocation handling** — After provider returns successfully for proof mode: validate manifest at `$artifactsDir/iter-$iteration/proof-manifest.json`, log `proof_manifest_validated` event, track `$script:lastProofIteration`, call `Register-IterationFailure` on validation failure. Mirror loop.sh lines 2260-2278. (`loop.ps1` post-provider section ~line 2202+) Note: `Register-IterationFailure` at line 952 currently excludes 'proof' mode — must add 'proof' to the allowed modes list. (priority: high)

- [x] **P1: loop.ps1 — output capture to artifacts** — Save provider output to `$artifactsDir/iter-$iteration/output.txt` after successful invocation. loop.sh uses offset-based extraction from `$LOG_FILE.raw` (lines 2355-2357), but loop.ps1 captures provider output in `$providerOutput` variable (line 2200) — write that directly to output.txt. Also capture `$script:lastProviderOutputText` as fallback. Place after provider invocation, before proof validation block (~line 2208). (priority: high) [implemented: loop.ps1:2208-2214]

### Spec-Gap Findings

- [ ] [spec-gap] **P2: SPEC.md stale "9 gates" references** — SPEC.md says "9 gates" in 3 places: line 443 ("Same 9 gates as the cycle's review"), line 3717 ("review.md # 9 gates"). README was already updated to 10 gates. Suggested fix: update SPEC.md to say 10 gates in all locations. Files: `SPEC.md:443`, `SPEC.md:3717`

- [ ] [spec-gap] **P2: SPEC.md acceptance criteria pipeline description contradicts design** — Lines 717 and 775 say "plan → build × 5 → proof → qa → review (9-step)" but SPEC line 407 explicitly states "Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence." The acceptance criteria text implies proof is in the continuous cycle, contradicting the actual design where proof is finalizer-only. Suggested fix: update acceptance criteria to say "Default continuous cycle: plan → build × 5 → qa → review (8-step); Finalizer includes proof as last step." Files: `SPEC.md:717`, `SPEC.md:775`

- [ ] [spec-gap] **P2: loop.sh `register_iteration_failure` excludes 'proof' mode** — `loop.sh:719` checks `[ "$iteration_mode" = "plan" ] || ... "review" ]` — 'proof' is not listed. loop.ps1 was already fixed (line 956 now includes 'proof'). loop.sh calls `register_iteration_failure` at line 2283 on proof validation failure but the call is a no-op. Cross-script parity issue. Suggested fix: add 'proof' to the allowed modes list in `loop.sh:719`. Files: `aloop/bin/loop.sh:719`

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
- [x] loop.ps1 — proof phase post-invocation handling: manifest validation, `proof_manifest_validated` event, `lastProofIteration` tracking, `Register-IterationFailure` on failure (lines 2210-2230, uncommitted)
- [x] loop.ps1 — added 'proof' to `Register-IterationFailure` allowed modes (line 953, uncommitted)
- [x] loop.ps1 — Validate-ProofManifest empty content guard (lines 881-902, committed in 792969a)
