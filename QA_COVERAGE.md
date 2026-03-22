# QA Coverage — Issue #101

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Validate-ProofManifest (loop.ps1) | 2026-03-22 | 03d1d95 | FAIL | Valid JSON accepted, invalid JSON rejected, missing file rejected. BUT empty file wrongly accepted as valid — bug filed |
| Baselines dir creation (loop.ps1) | 2026-03-22 | 03d1d95 | PASS | `New-Item` for baselines dir present at line 1852. Not yet testable end-to-end (deployed runtime is old version) |
| Per-iteration artifacts dir (loop.ps1) | 2026-03-22 | 03d1d95 | PASS | `New-Item` for iter-$iteration dir present at line 2188. Live sessions confirm iter-N dirs created with output.txt |
| aloop start lifecycle | 2026-03-22 | 03d1d95 | PASS | Scaffold → start → session created → stop works. Session creates meta.json, status.json, loop-plan.json correctly |
| aloop --version / --help | 2026-03-22 | 03d1d95 | PASS | Version 1.0.0 reported. Help lists all expected commands per README |
