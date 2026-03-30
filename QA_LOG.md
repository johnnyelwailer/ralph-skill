# QA Log

## QA Session — 2026-03-30 (issue-94)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-JNcWbj/bin/aloop`
- Version: 1.0.0
- Commit: 66abdb063
- Temp dirs: /tmp/qa-test-T8RuHP, /tmp/qa-test-wJo2TS
- Features tested: 4

### Results
- PASS: compile-loop-plan loopSettings from pipeline.yml
- PASS: loop.sh removed orchestrator settings (triage_interval, scan_pass_throttle_ms, rate_limit_backoff)
- PASS: resolveOrchestratorSettingsFromConfig reads pipeline.yml + CLI overrides
- PASS: concurrency_cap default and pipeline.yml override

### Bugs Filed
None.

### Command Transcript

```
# Install
ALOOP_BIN=$(node scripts/test-install.mjs --keep 2>&1 | tail -1)
# → /tmp/aloop-test-install-JNcWbj/bin/aloop
# version check:
aloop --version  # → 1.0.0

# Feature 1: loopSettings in loop-plan.json
# Added to pipeline.yml:
#   loop:
#     triage_interval: 10
#     scan_pass_throttle_ms: 45000
#     rate_limit_backoff: exponential
#     concurrency_cap: 5
aloop start --project-root /tmp/qa-test-T8RuHP --output json --in-place
# loop-plan.json loopSettings: {"triage_interval":10,"scan_pass_throttle_ms":45000,"rate_limit_backoff":"exponential"}
# concurrency_cap absent — expected (orchestrator-only, not a loop runner setting)
# EXIT: 0 ✓

# Feature 2: loop.sh does NOT have orchestrator settings
grep TRIAGE_INTERVAL /tmp/.../loop.sh  # → no output ✓
grep SCAN_PASS_THROTTLE_MS /tmp/.../loop.sh  # → no output ✓
grep RATE_LIMIT_BACKOFF /tmp/.../loop.sh  # → no output ✓

# Feature 3: resolveOrchestratorSettingsFromConfig
# Unit tests (all 6 pass):
npm test  # → ok 381 - resolveOrchestratorSettingsFromConfig (6/6 subtests pass)

# Integration test — reads from pipeline.yml:
aloop orchestrate --project-root /tmp/qa-test-T8RuHP --plan-only --spec SPEC.md --output json
# → concurrency_cap=5, triage_interval=10, scan_pass_throttle_ms=45000, rate_limit_backoff=exponential ✓

# Integration test — CLI overrides:
aloop orchestrate --project-root /tmp/qa-test-T8RuHP --plan-only --spec SPEC.md \
  --triage-interval 99 --rate-limit-backoff linear --concurrency 7 --output json
# → triage_interval=99, rate_limit_backoff=linear, concurrency_cap=7, scan_pass_throttle_ms=45000 (from yml) ✓

# Feature 4: concurrency_cap defaults
# Project with no loop: section:
aloop orchestrate --project-root /tmp/qa-test-wJo2TS --plan-only --output json
# → concurrency_cap=3, triage_interval=5, scan_pass_throttle_ms=30000, rate_limit_backoff=fixed ✓

# Project with only concurrency_cap: 8 in loop: section:
aloop orchestrate --project-root /tmp/qa-test-T8... --plan-only --output json
# → concurrency_cap=8, triage_interval=5 (default) ✓
```

### Notes
- 32 pre-existing test failures unrelated to issue-94 (GH request processor, orchestrate multi-file, EtagCache, etc.)
- Open TODO: backoff calculation strategies (exponential/linear/fixed) have no unit test — tracked in TODO.md
- `concurrency_cap` is correctly excluded from `loopSettings` in loop-plan.json (it is an orchestrator-level setting read by `resolveOrchestratorSettingsFromConfig`, not by the loop runner)
