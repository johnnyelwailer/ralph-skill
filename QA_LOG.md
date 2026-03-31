# QA Log

## QA Session — 2026-03-31 (final-qa re-run, issue-172)

### Test Environment
- Binary under test: /tmp/aloop-test-install-DmNGep/bin/aloop (cleaned up)
- Version: 1.0.0
- Install method: npm pack + isolated temp prefix (test-install script)
- Commit: 4e33972 (HEAD — only docs/review changes since prior QA at 6d5a314)
- Features tested: 4

### Scope Note
No code changes since the prior QA session (6d5a314). Changes between sessions: PR_DESCRIPTION.md, README.md, REVIEW_LOG.md, SPEC.md, TODO.md (docs/review only). Re-ran to confirm nothing regressed.

### Results
- PASS: All 7 unit tests in loop_provider_health_primitives.tests.sh (source)
- PASS: All 7 unit tests against installed loop.sh binary (LOOP_OVERRIDE)
- PASS: flock -s shared locks are concurrent-compatible
- PASS: flock -x exclusive blocks shared (rc=1 as expected)
- PASS: Stale .lock dir cleanup in installed binary (extract_func + direct call)
- PASS: mkdir in installed loop.sh only in cleanup comments, not acquisition path
- PASS: flock keywords present in installed binary (flock_mode -s/-x, flock -n)

### Bugs Filed
None — no regressions, no new bugs.

### Command Transcript

```
# Install from source (pack → isolated temp prefix)
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-DmNGep/bin/aloop

# Verify binary
/tmp/aloop-test-install-DmNGep/bin/aloop --version
# → 1.0.0

# Unit tests (source)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# Unit tests (installed binary via LOOP_OVERRIDE)
LOOP_OVERRIDE=...dist/bin/loop.sh bash loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# flock -s + flock -s: concurrent shared locks
exec 20>"$LOCK_FILE"; flock -s 20; exec 21>"$LOCK_FILE"; flock -n -s 21
# → PASS: shared+shared concurrent

# flock -x + flock -s: exclusive blocks shared
exec 22>"$LOCK_FILE"; flock -x 22; exec 23>"$LOCK_FILE"; flock -n -s 23
# → PASS: exclusive blocks shared (rc=1)

# Stale .lock dir cleanup (installed binary)
mkdir -p "$PROVIDER_HEALTH_DIR/claude.json.lock"
ensure_provider_health_dir (extracted from installed loop.sh)
# → PASS: stale .lock dir cleaned up

# No mkdir in lock acquisition path
grep -n "mkdir" installed_loop.sh | grep -i lock
# → only 2 lines: cleanup comments in ensure_provider_health_dir, not acquire

# Cleanup
rm -rf /tmp/aloop-test-install-DmNGep
```

---

## QA Session — 2026-03-31 (final-qa, issue-172)

### Test Environment
- Binary under test: /tmp/aloop-test-install-g0IE8k/bin/aloop (cleaned up)
- Version: 1.0.0
- Install method: npm pack + isolated temp prefix (test-install script)
- Features tested: 4

### Features Tested
1. POSIX flock-based health file locking (acquire/release cycle)
2. Stale .lock directory cleanup from old mkdir approach
3. Concurrent lock semantics (shared vs exclusive)
4. Progressive backoff and graceful degradation

### Results
- PASS: All 7 unit tests in loop_provider_health_primitives.tests.sh (source)
- PASS: All 7 unit tests against installed loop.sh binary
- PASS: Stale .lock directory cleanup verified
- PASS: Shared locks are concurrent-compatible
- PASS: Exclusive lock blocks shared lock
- PASS: Progressive backoff works (5 retries, ~750ms total elapsed under contention)
- PASS: Lock failure → rc=1, logs health_lock_failed, no crash
- PASS: loop.sh bundled correctly in npm package
- INFO: SPEC.md still says `.flock` extension and FD 9 — impl uses `.lock` and dynamic FD — low priority doc fix already tracked in TODO.md

### Bugs Filed
None — no new bugs. The SPEC discrepancy was already filed by the review agent.

### Command Transcript

```
# Build
npm --prefix aloop/cli run build
# → success (dashboard + server + bin bundles)

# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-g0IE8k/bin/aloop

# Verify binary
/tmp/aloop-test-install-g0IE8k/bin/aloop --version
# → 1.0.0

# Unit tests (source)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# Unit tests (installed binary)
bash <adapted_tests_pointing_at_installed_loop_sh>
# → All tests passed! (7/7)

# flock -s shared lock compatibility
exec 10>"$LOCK_FILE"; flock -s 10; exec 11>"$LOCK_FILE"; flock -n -s 11
# → success (concurrent shared locks compatible)

# flock -x blocks -s
exec 12>"$LOCK_FILE"; flock -x 12; exec 13>"$LOCK_FILE"; flock -n -s 13
# → FAIL (rc=1, as expected — exclusive blocks shared)

# Stale dir cleanup
mkdir -p "$PROVIDER_HEALTH_DIR/claude.json.lock"
ensure_provider_health_dir
[ -d "$PROVIDER_HEALTH_DIR/claude.json.lock" ] && echo FAIL || echo PASS
# → PASS

# Progressive backoff under contention
acquire_provider_health_lock (with exclusive lock held by another process)
# → rc=1 after ~772ms (5 retries with 50ms delays each)

# No mkdir in lock acquisition path
grep "mkdir.*lock" installed loop.sh (excluding cleanup comments)
# → no matches

# Bundled correctly
ls dist/bin/loop.sh
# → PASS: present in npm package

# Cleanup
rm -rf /tmp/aloop-test-install-g0IE8k
```
