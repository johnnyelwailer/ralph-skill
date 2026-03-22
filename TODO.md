# TODO

## Current Phase: Proof artifact infrastructure (Issue #101)

### In Progress

- [x] Proof skip protocol: when proof-manifest.json has an empty `artifacts` array, log the skip reason from `skipped` entries but do NOT treat as iteration failure. Currently both loop.sh and loop.ps1 validate only file-exists + valid-JSON — they don't distinguish "empty artifacts = intentional skip" from "full proof." TASK_SPEC says "if manifest has empty artifacts array, log skip reason but don't treat as failure." Add post-validation logic after `validate_proof_manifest` in both scripts to check `artifacts` array length and log accordingly. (priority: high)

- [ ] Expand `aloop/templates/subagent-hints-proof.md` with vision-model delegation examples. Currently only 4 lines listing two subagents. TASK_SPEC says "Expand with vision-model delegation examples (reference `aloop/agents/opencode/vision-reviewer.md`)." Add concrete examples showing how to delegate screenshot analysis to vision-reviewer (tool call syntax, when to use it, what to pass). (priority: medium)

### Up Next

- [ ] [qa/P1] Re-verify template variable resolution at runtime: QA found `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` "unresolved" but the QA checked the raw template file on disk (`prompts/PROMPT_proof.md`), not the runtime-substituted content passed to the provider. Code at loop.sh:283-292 and loop.ps1:861-875 substitutes these in memory. Needs a QA re-test that actually triggers a proof iteration and verifies the resolved prompt. (priority: medium)

- [ ] [qa/P1] Re-verify baselines directory creation: QA says `artifacts/baselines/` not created, but loop.sh:1967 and loop.ps1:1917 both run `mkdir -p "$ARTIFACTS_DIR/baselines"` unconditionally at session init. The QA test 2 had iterations run with `artifacts/iter-N/` created (same parent), so baselines should also exist. Needs re-test to confirm — the original QA may have checked the wrong path. (priority: medium)

- [ ] [review] Gate 10: QA coverage is 28.6% (2 PASS / 7 features) — below 30% threshold. Root cause: proof phase never runs in QA because finalizer array is empty in loop-plan.json. After implementing proof skip protocol above, re-run QA covering proof manifest validation, proof skip protocol, and subagent hints. This should move BLOCKED features to PASS/FAIL and push coverage above 30%. (priority: high)

### Completed

(none yet)
