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

## QA Session — 2026-03-22 (iteration 17)

### Test Environment
- Binary under test: /tmp/aloop-test-install-kbmNoz/bin/aloop (version 1.0.0)
- Installed via: `npm --prefix aloop/cli run --silent test-install -- --keep`
- Temp dir: /tmp/qa-test-1774173256
- Features tested: 5
- Commit: edd0ff4

### Results
- PASS: aloop dashboard (serves SPA HTML, assets load)
- PASS: aloop steer (creates STEERING.md, error handling correct)
- FAIL: README gate count (says "9 gates" in 4 places, template has 10 — bug filed)
- PASS: aloop scaffold (config.yml + 6 prompt templates created correctly)
- FAIL: Validate-ProofManifest empty file (still accepts empty/whitespace — bug persists from iter 16)

### Bugs Filed
- [qa/P1] README says "9 gates" but review template has 10 — Gate 10 (QA Coverage & Bug Fix Rate) missing from README

### Command Transcript

#### Install
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary under test: /tmp/aloop-test-install-kbmNoz/bin/aloop
$ aloop --version
1.0.0
```

#### Test 1: aloop dashboard
```
$ aloop dashboard --port 4077 --workdir /tmp/qa-test-1774173256
Launching real-time progress dashboard on port 4077...
Exit code: 0 (backgrounded)

$ curl -s -o /tmp/qa-dashboard-4077.html -w "%{http_code}" http://localhost:4077
HTTP status: 200
Content: <!DOCTYPE html><html lang="en">...<title>Aloop Dashboard</title>...
  <script type="module" crossorigin src="/assets/index-DlgYfJlX.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-DiztzrGm.css">
  <div id="root"></div>
PASS: SPA HTML served correctly with bundled assets

$ curl -s http://localhost:4077/api/events
{"error":"Not found"}
$ curl -s http://localhost:4077/api/status
{"error":"Not found"}
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4077/api/docs/TODO.md
HTTP 404
NOTE: All /api/* routes return 404. Dashboard shell loads but backend API not functional.
      May be out-of-scope for issue #101 (proof artifacts).
```

#### Test 2: aloop steer
```
$ aloop steer
error: missing required argument 'instruction'
Exit code: 1
PASS: missing arg handled

$ aloop steer --session "nonexistent-session-id" "focus on tests"
Session not found: nonexistent-session-id
Exit code: 1
PASS: invalid session handled

$ aloop scaffold && aloop start --max-iterations 1 --provider claude --in-place
Session: qa-test-1774173256-20260322-095552, PID: 970843
Exit code: 0

$ aloop steer --session qa-test-1774173256-20260322-095552 "focus on writing unit tests"
Steering instruction queued for session qa-test-1774173256-20260322-095552.
Exit code: 0
PASS: STEERING.md created in workdir with correct format

$ aloop steer --session qa-test-1774173256-20260322-095552 "now focus on linting"
A steering instruction is already queued. Use --overwrite to replace it.
Exit code: 1
PASS: duplicate steer blocked

$ aloop steer --session qa-test-1774173256-20260322-095552 --overwrite "now focus on linting"
Steering instruction queued for session qa-test-1774173256-20260322-095552.
Exit code: 0
PASS: --overwrite replaces existing instruction

$ aloop stop qa-test-1774173256-20260322-095552
Session stopped.
Exit code: 0
```

#### Test 3: README gate count
```
$ grep -n "9.*gate\|gate.*9" README.md
Line 13: Review — Audits the build against 9 quality gates
Line 73: The review agent enforces 9 gates on every build iteration
Line 185: PROMPT_review.md  # Review agent (9 gates)
Line 213: 9 review gates: Spec compliance, test depth, ...

$ grep "### Gate" <installed review template>
Gate 1-9: present
Gate 10: QA Coverage & Bug Fix Rate  ← NOT in README
FAIL: README says 9 gates, review template has 10. Bug filed.
```

#### Test 4: aloop scaffold
```
$ cd /tmp/qa-scaffold-test-977590 && git init && aloop scaffold
{
  "config_path": "/home/pj/.aloop/projects/5e97014e/config.yml",
  "prompts_dir": "/home/pj/.aloop/projects/5e97014e/prompts",
  "project_dir": "/home/pj/.aloop/projects/5e97014e",
  "project_hash": "5e97014e"
}
Exit code: 0

Config contains: project_name, project_root, language, provider, mode,
  autonomy_level, data_privacy, spec_files, safety_rules, enabled_providers,
  models, round_robin_order, privacy_policy, created_at

Prompts: PROMPT_build.md, PROMPT_plan.md, PROMPT_proof.md,
  PROMPT_qa.md, PROMPT_review.md, PROMPT_steer.md
PASS: All expected config fields and prompt templates present
```

#### Test 5: Re-test Validate-ProofManifest empty file
```
$ pwsh -NoProfile -Command '<extract + test Validate-ProofManifest>'
Test 1: Valid manifest → Result: True → PASS
Test 2: Empty file → Result: True → FAIL (empty file still accepted)
Test 3: Whitespace-only → Result: True → FAIL (whitespace still accepted)
Bug still open from iter 16, noted as still failing.
```

### Observations
1. Dashboard API routes all return 404 — the SPA shell loads but can't fetch data. This may be a broader issue not specific to issue #101.
2. `aloop steer --affects-completed-work` flag exists but defaults to "unknown" — not tested for "yes"/"no" behavior
3. Scaffold is idempotent — re-running returns the same project hash for same directory

### Cleanup
- Removed /tmp/qa-test-1774173256
- Removed /tmp/qa-scaffold-test-977590
- Removed /tmp/aloop-test-install-kbmNoz
- Removed test sessions and project configs from ~/.aloop/
