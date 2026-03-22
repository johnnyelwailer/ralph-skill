# QA Coverage — Issue #101

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Validate-ProofManifest (loop.ps1) | 2026-03-22 | edd0ff4 | FAIL | Re-tested iter 17: empty file + whitespace-only still accepted. Bug persists. |
| Baselines dir creation (loop.ps1) | 2026-03-22 | 03d1d95 | PASS | `New-Item` for baselines dir present at line 1852. Not yet testable end-to-end (deployed runtime is old version) |
| Per-iteration artifacts dir (loop.ps1) | 2026-03-22 | 03d1d95 | PASS | `New-Item` for iter-$iteration dir present at line 2188. Live sessions confirm iter-N dirs created with output.txt |
| aloop start lifecycle | 2026-03-22 | 03d1d95 | PASS | Scaffold → start → session created → stop works. Session creates meta.json, status.json, loop-plan.json correctly |
| aloop --version / --help | 2026-03-22 | 03d1d95 | PASS | Version 1.0.0 reported. Help lists all expected commands per README |
| aloop dashboard | 2026-03-22 | edd0ff4 | PASS | Serves SPA HTML correctly. Assets load. Note: all /api/* routes return 404 (likely out-of-scope for issue #101) |
| aloop steer | 2026-03-22 | edd0ff4 | PASS | Creates STEERING.md in workdir. Error on missing args. Error on duplicate without --overwrite. --overwrite works. |
| README gate count | 2026-03-22 | edd0ff4 | FAIL | README says "9 gates" in 4 places, review template says 10. Gate 10 (QA Coverage & Bug Fix Rate) missing from README table. Bug filed. |
| aloop scaffold | 2026-03-22 | edd0ff4 | PASS | Creates config.yml with all expected fields, generates all 6 prompt templates, idempotent on re-run |
