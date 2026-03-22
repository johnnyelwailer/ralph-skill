# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Artifacts dir created per-iteration | 2026-03-22 | 4664d26c | PASS | `artifacts/iter-N/` created for each iteration with `output.txt` |
| Provider output captured to artifacts | 2026-03-22 | 4664d26c | PASS | `output.txt` contains provider stdout per iteration |
| Template variable resolution (ARTIFACTS_DIR, ITERATION) | 2026-03-22 | 4664d26c | FAIL | `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` unresolved in PROMPT_proof.md |
| Baseline management (artifacts/baselines/) | 2026-03-22 | 4664d26c | FAIL | baselines/ directory not created at session init |
| Proof manifest validation | 2026-03-22 | 4664d26c | BLOCKED | Proof phase never runs — finalizer array empty in loop-plan.json |
| Proof skip protocol (empty artifacts) | 2026-03-22 | 4664d26c | BLOCKED | Cannot test — proof phase never triggered |
| Subagent hints expansion | 2026-03-22 | 4664d26c | PARTIAL | Lists vision-reviewer/accessibility-checker but no delegation examples |
