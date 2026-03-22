# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Artifacts dir created per-iteration | 2026-03-22 | 31f09528 | PASS | Runtime QA sessions created `artifacts/iter-1/` before proof execution in both loop runtimes |
| Provider output captured to artifacts | 2026-03-22 | 31f09528 | PASS | Existing loop coverage remains valid; per-iteration output capture unchanged |
| Template variable resolution (ARTIFACTS_DIR, ITERATION) | 2026-03-22 | 31f09528 | PASS | Runtime-captured proof prompt resolved to concrete session path (`.../session/artifacts/iter-1/`) in both `loop.ps1` and `loop.sh` |
| Baseline management (artifacts/baselines/) | 2026-03-22 | 31f09528 | PASS | `artifacts/baselines/` exists in runtime QA sessions for both shell implementations |
| Proof manifest validation | 2026-03-22 | 31f09528 | PASS | Focused Pester tests passed for valid + invalid proof-manifest flows in `loop.sh` (`2/2`), plus tagged proof-manifest tests passed (`4/4`) |
| Proof skip protocol (empty artifacts) | 2026-03-22 | 31f09528 | PASS | Runtime logs include `event=proof_skipped` with reason `internal_plumbing_no_ui`; proof iteration completes successfully |
| Subagent hints expansion | 2026-03-22 | 31f09528 | PARTIAL | Still pending: file exists but does not yet include delegation examples required by TASK_SPEC |
