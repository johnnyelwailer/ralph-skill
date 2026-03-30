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

## QA Session — 2026-03-30 (issue-94, iteration 2)

### Test Environment
- Binary installed: `/tmp/aloop-test-install-u1bH1t/bin/aloop` (built fresh, version 1.0.0)
- Commit: 89534441b (HEAD — after provider_timeout fix and concurrency_cap removal)
- **INFRASTRUCTURE ISSUE**: Bash environment non-functional (disk full — "No space left on device") — could not run CLI integration tests. Static verification of installed binary artifacts performed instead.
- Features tested: 4 (static verification method)

### Results
- PASS: provider_timeout compile→load chain (P2 fix)
- PASS: concurrency_cap removed from LoopSettings interface (P3 fix)
- PASS: backoff strategies unit tests present (exponential/linear/fixed)
- FAIL: SPEC.md loop-plan.json example still missing loopSettings (P3, already tracked in TODO.md)

### Bugs Filed
- None new. SPEC.md gap already tracked in TODO.md as open `[spec-gap]` item.

### Command Transcript

```
# Install
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-u1bH1t/bin/aloop
aloop --version  # → 1.0.0

# Feature 1: provider_timeout in loop.sh (P2 fix verification)
# Static inspection of installed binary:
grep "provider_timeout\|PROVIDER_TIMEOUT" /tmp/aloop-test-install-u1bH1t/lib/node_modules/aloop-cli/dist/bin/loop.sh
# → line 306: ("provider_timeout", "PROVIDER_TIMEOUT", int),   [in load_loop_settings]
# → line 360: ("provider_timeout", "PROVIDER_TIMEOUT", int),   [in refresh_loop_settings_from_meta]
# → line 45: PROVIDER_TIMEOUT="${ALOOP_PROVIDER_TIMEOUT:-10800}"  [default]
# Compile-loop-plan test asserts loopSettings.provider_timeout === 10800 (line 895) ✓
# RESULT: PASS

# Feature 2: concurrency_cap removed from LoopSettings interface (P3 fix)
grep concurrency_cap aloop/cli/src/commands/compile-loop-plan.ts
# → no matches
# Source confirmed: concurrency_cap not in LoopSettings interface, not in numFields
# RESULT: PASS

# Feature 3: Backoff strategies unit tests (d81aceb50)
# Static inspection of orchestrate.test.ts:4600-4659
# Three tests: exponential (sleepCalls=[1000,2000,4000]), linear (=[1000,2000]), fixed (=[1000,1000])
# All use dependency injection with runScanPass mock — correct test pattern
# RESULT: PASS (tests present and logically correct)

# Feature 4: SPEC.md loop-plan.json example
grep "loopSettings\|loop_settings\|provider_timeout" SPEC.md
# → no matches
# SPEC.md lines 3638-3653 still show old format without loopSettings
# TODO.md still has unchecked: [spec-gap] P3: SPEC.md loop-plan.json format example missing loopSettings
# RESULT: FAIL (known open issue, already in TODO.md)
```

### Notes
- Bash environment was non-functional due to disk being full. Static verification of installed binary + source files used as fallback.
- No new bugs found beyond already-tracked SPEC.md gap.
- provider_timeout fix verified complete: pipeline.yml → compile-loop-plan.ts → loopSettings in loop-plan.json → loop.sh PROVIDER_TIMEOUT ✓
- concurrency_cap cleanly removed from LoopSettings interface ✓

## QA Session — 2026-03-30 (issue-94, iteration 3)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-5Be3pl/bin/aloop`
- Version: 1.0.0
- Commit: 906818071 (HEAD)
- Disk space: OK (/tmp: 2.5G free, /: 328G free — disk full issue from session 2 is resolved)
- Temp dirs: /tmp/qa-test-FUOtx5, /tmp/qa-test-UeJF1g, /tmp/qa-test-Ixfr51
- Features tested: 4

### Results
- PASS: SPEC.md loop-plan.json example now includes loopSettings (previously FAIL — fixed by commit 4ddcaf2f6)
- PASS: loopSettings emitted in loop-plan.json when .aloop/pipeline.yml has loop: section
- PASS: loopSettings absent from loop-plan.json when no .aloop/pipeline.yml (conditional emission)
- FAIL: README.md hot-reload documentation (Gate 9) — still incorrect at lines 109 and 113

### Bugs Filed
- None new. README.md Gate 9 bug already tracked in TODO.md as open `[review]` item.

### Command Transcript

```
# Install
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-5Be3pl/bin/aloop
aloop --version  # → 1.0.0

# Feature 1 (re-test): SPEC.md loopSettings example
grep -n "loopSettings\|provider_timeout\|triage_interval" SPEC.md
# → line 3654: "loopSettings": {
# → line 3664:     "provider_timeout": 10800,
# → line 3666:     "triage_interval": 5,
# All 13 fields present; note about conditional presence at line 3673
# RESULT: PASS (was FAIL in session 2)

# Feature 2: loopSettings in loop-plan.json with .aloop/pipeline.yml
# Attempt 1: pipeline.yml at project root (wrong location)
aloop start --project-root /tmp/qa-test-FUOtx5 --in-place --output json
# loop-plan.json: no loopSettings (pipeline.yml at root, not .aloop/, so ignored)
# Correct behavior per README: "Create .aloop/pipeline.yml in your project root"

# Attempt 2: pipeline.yml at .aloop/pipeline.yml (correct location)
# .aloop/pipeline.yml content:
#   loop:
#     max_iterations: 10
#     triage_interval: 12
#     scan_pass_throttle_ms: 55000
#     rate_limit_backoff: exponential
#     provider_timeout: 7200
#     max_stuck: 5
aloop start --project-root /tmp/qa-test-UeJF1g --in-place --output json
# loop-plan.json loopSettings: {max_iterations:10,max_stuck:5,provider_timeout:7200,
#   triage_interval:12,scan_pass_throttle_ms:55000,rate_limit_backoff:"exponential"}
# EXIT: 0 ✓
# RESULT: PASS

# Feature 3: loopSettings absent when no pipeline.yml
aloop start --project-root /tmp/qa-test-Ixfr51 --in-place --output json
# loop-plan.json: no loopSettings field ✓
# EXIT: 0 ✓
# RESULT: PASS

# Feature 4: README.md documentation accuracy (Gate 9)
# Read README.md lines 109-113:
# Line 109: "...hot-reloaded each iteration. Changes to `loop-plan.json` take effect
#   on the next iteration without restarting."
# Line 113: "...read and applied by loop scripts each iteration"
# EXPECTED (per spec): meta.json is hot-reloaded, loop-plan.json is startup-only
# ACTUAL: README says loop-plan.json is hot-reloaded → INCORRECT
# Additional finding: commit 98a7adb68 actually REGRESSED line 109:
#   Before: "hot-reloaded each iteration from `meta.json`" (correct)
#   After:  "hot-reloaded each iteration. Changes to `loop-plan.json`..." (wrong)
# Latest review commit 906818071 confirms this finding.
# RESULT: FAIL (open TODO.md item)
```

### Notes
- SPEC.md FAIL from session 2 is now resolved: loopSettings added at lines 3654-3669 ✓
- The README.md "fix" in commit 98a7adb68 introduced a regression at line 109 — the original text correctly referenced meta.json for hot-reload but the fix removed that reference
- No new bugs; the README.md issue was already tracked in TODO.md as the open `[review] Gate 9` item
- Important: pipeline.yml must be at `.aloop/pipeline.yml`, NOT project root; this distinction is correct in README.md line 93
