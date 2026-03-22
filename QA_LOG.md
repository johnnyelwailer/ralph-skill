# QA Log — Issue #172

## QA Session — 2026-03-22 (final-qa)

### Binary Under Test
- Path: `/tmp/aloop-test-install-0yKgW8/bin/aloop`
- Version: 1.0.0

### Test Environment
- Isolated HOME: `/tmp/qa-test-home-172`
- Test project: `/tmp/qa-test-172-1774178182`
- Features tested: 5 (health file format, stale cleanup, concurrent access, shared/exclusive locking, aloop status)

### Results
- PASS: Health file creation & JSON format
- PASS: Stale .lock directory cleanup
- PASS: Concurrent flock access (no corruption)
- PASS: Shared read / exclusive write semantics
- PASS: `aloop status` provider health display

### Bugs Filed
None — all features pass.

### Detailed Results

#### Feature 1: Health File Creation & Format

```
$ HOME=/tmp/qa-test-home-172 aloop setup --providers claude --non-interactive --spec SPEC.md
Setup complete. Config written to: /tmp/qa-test-home-172/.aloop/projects/6f983a5e/config.yml

$ HOME=/tmp/qa-test-home-172 aloop start --provider claude --max-iterations 1
Aloop loop started!
  Session:  qa-test-172-1774178182-20260322-111651
  Provider: claude
  PID:      1732215

$ ls -la /tmp/qa-test-home-172/.aloop/health/
claude.json        (153 bytes)
claude.json.flock  (0 bytes, sidecar)

$ cat /tmp/qa-test-home-172/.aloop/health/claude.json
{"status":"healthy","last_success":null,"last_failure":"2026-03-22T11:16:52Z","failure_reason":"unknown","consecutive_failures":1,"cooldown_until":null}

$ python3 -c "validate JSON fields"
  PASS: status = healthy
  PASS: last_success = None
  PASS: last_failure = 2026-03-22T11:16:52Z
  PASS: failure_reason = unknown
  PASS: consecutive_failures = 1
  PASS: cooldown_until = None
  Status valid: True (in healthy|cooldown|degraded)
```

All 6 required fields present per spec. `.flock` sidecar file (FD 9 target) present alongside health JSON.

#### Feature 2: Stale .lock Directory Cleanup

```
$ mkdir -p /tmp/qa-test-home-172/.aloop/health/claude.json.lock
$ mkdir -p /tmp/qa-test-home-172/.aloop/health/codex.json.lock
$ ls health/ | grep lock
claude.json.flock
claude.json.lock  (stale mkdir dir)
codex.json.lock   (stale mkdir dir)

$ HOME=/tmp/qa-test-home-172 aloop start --provider claude --max-iterations 1
(loop starts)

$ ls health/ | grep .lock$
(none — stale dirs removed)
$ ls health/ | grep .flock
claude.json.flock  (sidecar preserved)
```

PASS: `ensure_provider_health_dir()` removes old mkdir-based `.lock` directories while preserving `.flock` sidecar files.

#### Feature 3: Concurrent flock Access (Stress Test)

**Test A — 5 writers, no retry (raw contention):**
```
$ bash qa-flock-stress.sh (5 concurrent writers × 20 iterations)
Many "flock failed" messages (expected with -n non-blocking, no retry)
Final file: {"status":"healthy","writer":"writer-4","iteration":20,"ts":"2026-03-22T11:18:02Z"}
JSON valid: YES
No corruption: 84 bytes (no partial writes)
```

**Test B — 5 writers with 5-attempt retry + progressive backoff:**
```
$ bash qa-flock-retry.sh (5 concurrent writers × 10 iterations, 5 retries each)
All 5 writers completed 10 iterations
Lock failures: 0 (retry eliminates contention)
Final file: {"status":"healthy","writer":"writer-3","iteration":10,"ts":"2026-03-22T11:18:18Z"}
JSON valid: YES
```

PASS: Atomic tmp+mv prevents corruption. 5-attempt retry with 50–250ms backoff eliminates lock failures under realistic contention.

#### Feature 4: Shared Read vs Exclusive Write Semantics

```
$ (hold exclusive flock -x for 3s)
EXCLUSIVE: lock acquired, holding for 3s

$ (attempt shared flock -n -s while exclusive held)
SHARED READ: blocked (CORRECT)

$ (exclusive released)
EXCLUSIVE: lock released

$ (attempt shared flock -n -s after release)
SHARED READ: acquired (CORRECT)

$ (3 concurrent shared readers)
READER 1: shared lock acquired
READER 2: shared lock acquired
READER 3: shared lock acquired
All readers finished — concurrent shared reads work
```

PASS: `flock -s` (shared/read) correctly blocked by `flock -x` (exclusive/write). Multiple concurrent shared reads succeed simultaneously.

#### Feature 5: aloop status — Provider Health Display

```
$ HOME=/tmp/qa-test-home-172 aloop status
Active Sessions:
  qa-test-172-1774178182-20260322-111651  pid=1732215  stopped  iter 1, plan  (31s ago)
    workdir: /tmp/qa-test-home-172/.aloop/sessions/.../worktree

Provider Health:
  claude     healthy
```

PASS: `aloop status` reads health files and displays provider status table matching spec format.

### Cleanup
```
$ rm -rf /tmp/qa-test-172-* /tmp/qa-test-home-172 /tmp/aloop-test-install-0yKgW8
Cleaned up test resources
```
