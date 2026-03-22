# QA Log — Issue #101

## QA Session — 2026-03-22 (iteration 16)

### Test Environment
- Binary under test: /tmp/aloop-test-install-PUaLi4/bin/aloop (version 1.0.0)
- Installed via: `npm --prefix aloop/cli run --silent test-install -- --keep`
- Temp dir: /tmp/qa-test-proof-1774171321
- Features tested: 5
- PowerShell: 7.5.4

### Results
- PASS: Baselines directory creation (loop.ps1)
- PASS: Per-iteration artifacts directory creation (loop.ps1)
- PASS: aloop start lifecycle (scaffold → start → stop)
- PASS: aloop --version / --help
- FAIL: Validate-ProofManifest empty file handling (bug filed)

### Bugs Filed
- [qa/P1] Validate-ProofManifest accepts empty file as valid JSON

### Command Transcript

#### Install
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary under test: /tmp/aloop-test-install-PUaLi4/bin/aloop
$ aloop --version
1.0.0
```

#### Test 1: Validate-ProofManifest (PowerShell)
```
$ pwsh -NoProfile -Command '... extract Validate-ProofManifest from loop.ps1 ...'

=== Test 1: Valid manifest ===
Result: True
PASS: Valid manifest accepted

=== Test 2: Invalid JSON ===
Result: False
PASS: Invalid JSON rejected

=== Test 3: Missing manifest ===
Result: False
PASS: Missing manifest rejected

=== Test 4: Empty file ===
Result: True
FAIL: Empty file accepted
Exit code: 0
```

#### Test 2: Baselines directory creation (loop.ps1)
```
$ pwsh -NoProfile -Command '... check loop.ps1 for baselines ...'
PASS: baselines directory reference found in loop.ps1
  Line 1851 : # Create artifacts baselines directory for proof agent diffing
  Line 1852 : New-Item -ItemType Directory -Path (Join-Path $artifactsDir "baselines") -Force | Out-Null
PASS: baselines directory creation (New-Item) found
```

#### Test 3: Per-iteration artifacts directory (loop.ps1)
```
$ pwsh -NoProfile -Command '... check loop.ps1 for iter-N ...'
PASS: Per-iteration artifacts directory reference found
  Line 2188 : New-Item -ItemType Directory -Path (Join-Path $artifactsDir "iter-$iteration") -Force | Out-Null
```

#### Test 4: aloop start lifecycle
```
$ cd /tmp/qa-test-proof-1774171321
$ aloop scaffold
{"config_path":"/home/pj/.aloop/projects/52159e55/config.yml","prompts_dir":...}
Exit code: 0

$ aloop start --max-iterations 1 --provider claude --in-place
Aloop loop started!
  Session:  qa-test-proof-1774171321-20260322-092402
  Mode:     plan-build-review
  Provider: claude
  PID:      664074
Exit code: 0

$ aloop stop qa-test-proof-1774171321-20260322-092402
Session qa-test-proof-1774171321-20260322-092402 stopped.
Exit code: 0
```

#### Test 5: aloop --version / --help
```
$ aloop --version
1.0.0
Exit code: 0

$ aloop --help
Usage: aloop [options] [command]
  Commands: resolve, discover, setup, scaffold, start, dashboard, status,
            active, stop, update, devcontainer, devcontainer-verify,
            orchestrate, steer, process-requests, gh
Exit code: 0

$ aloop status
Active Sessions: 7 sessions listed (orchestrator + 6 child loops)
Provider Health: claude=healthy, codex=healthy, copilot=healthy, gemini=cooldown, opencode=healthy
Exit code: 0
```

### Observations
1. Live sessions (e.g. issue-101, issue-124) have per-iteration artifact dirs (iter-1 through iter-15) with output.txt files — confirms loop.sh output capture works
2. No `baselines/` directory exists in any live session — expected since deployed runtime predates the baselines commit
3. `--harness` is not a valid flag for `aloop start` (error: unknown option)
4. `aloop start` requires `aloop scaffold` first — error message clearly states "Run `aloop setup` first"

### Cleanup
- Removed /tmp/qa-test-proof-1774171321
- Removed /tmp/aloop-test-install-PUaLi4
- Removed test sessions from ~/.aloop/sessions/
