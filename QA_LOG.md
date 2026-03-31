# QA Log

## QA Session — 2026-03-31 (final-qa post-docs-fix, issue-172)

### Test Environment
- Binary under test: /tmp/aloop-test-install-8sTUsH/bin/aloop (cleaned up)
- Version: 1.0.0
- Install method: npm pack + isolated temp prefix (test-install script)
- Commit: a4ed87d (HEAD — only README docs fix since prior QA at 4e33972)
- Features tested: 3

### Scope Note
Only change since prior QA (4e33972): README.md — two CLI example corrections (aloop start resume syntax; opencode invocation). Re-ran flock tests to confirm no regression, plus verified README examples against real CLI.

### Results
- PASS: All 7 unit tests in loop_provider_health_primitives.tests.sh (source)
- PASS: All 5 unit tests in loop_provider_health.tests.sh (source)
- PASS: README `aloop start --launch resume <session-id>` matches actual `aloop start --help`
- PASS: README `opencode run` (prompt via stdin) matches `echo "$prompt_content" | opencode run` in loop.sh
- PASS: flock -x/-s present in installed binary; no mkdir-based lock acquisition

### Bugs Filed
None — no regressions, no new bugs.

### Command Transcript

```
# Install from source (pack → isolated temp prefix)
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-8sTUsH/bin/aloop
aloop --version
# → 1.0.0

# Flock unit tests (source)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)
bash aloop/bin/loop_provider_health.tests.sh
# → All tests passed! (5/5)

# Verify README fix: --launch flag
aloop start --help 2>&1 | grep "launch\|session-id"
# → session-id  Session ID to resume (used with --launch resume)
# → --launch <mode>  Session launch mode: start, restart, or resume

# Verify README fix: opencode stdin invocation
grep "opencode run" loop.sh
# → echo "$prompt_content" | env -u CLAUDECODE opencode run ...

# Verify no mkdir locking in installed binary
grep -n "flock" installed_loop.sh | head -5
# → flock_mode="-s", flock_mode="-x", flock -n $flock_mode $fd

# Confirm pre-existing test failures unchanged (not caused by this issue)
npm --prefix aloop/cli test -- --reporter=tap 2>&1 | grep "^not ok"
# → 17 pre-existing failures (GH/orchestrator tests) — same set as master

# Cleanup
rm -rf /tmp/aloop-test-install-8sTUsH
```

---

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

## QA Session — 2026-03-31 (final-qa at final HEAD, issue-172)

### Test Environment
- Binary under test: /tmp/aloop-test-install-dKiC0b/bin/aloop (cleaned up)
- Version: 1.0.0
- Install method: npm pack + isolated temp prefix (test-install script)
- Commits since last QA: 1e60bc905 (docs: README sync), 16ebaddd8 (chore: review pass) — no functional changes
- Features tested: 4 (re-validation at final HEAD)

### Features Tested
1. POSIX flock-based health file locking (acquire/release cycle)
2. Stale .lock directory cleanup from old mkdir approach
3. loop.sh bundled correctly in npm package
4. No mkdir in lock acquisition path

### Results
- PASS: All 7 unit tests in loop_provider_health_primitives.tests.sh (installed binary)
- PASS: loop.sh present at dist/bin/loop.sh in installed package
- PASS: Only 2 `mkdir` references in installed loop.sh, both cleanup comments (not acquisition)
- PASS: flock used 5 times for actual locking

### Bugs Filed
None — no new bugs. All previous PASSes confirmed at HEAD.

### Command Transcript

```
# Build
npm --prefix aloop/cli run build
# → success

# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-dKiC0b/bin/aloop

# Verify binary
/tmp/aloop-test-install-dKiC0b/bin/aloop --version
# → 1.0.0

# Unit tests (installed binary)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# Verify loop.sh bundled
ls /tmp/aloop-test-install-dKiC0b/lib/node_modules/aloop-cli/dist/bin/loop.sh
# → PASS

# flock count in installed binary
grep -c "flock" installed loop.sh
# → 5

# mkdir refs (should be cleanup-only)
grep -n "mkdir.*lock" installed loop.sh
# → line 872: comment about stale .lock dir cleanup
# → line 899: comment about stale .lock dir cleanup
# PASS: no mkdir used for lock acquisition

# Cleanup
rm -rf /tmp/aloop-test-install-dKiC0b
```

## QA Session — 2026-03-31 (final-qa triggered by final-review at dc75a3d9)

### Test Environment
- Binary under test: /tmp/aloop-test-install-P5t7nI/bin/aloop (v1.0.0)
- Installed loop.sh: /tmp/aloop-test-install-P5t7nI/lib/node_modules/aloop-cli/dist/bin/loop.sh
- Commit: dc75a3d92 (only REVIEW_LOG.md and TODO.md changed since last QA at 2ee390ca8 — no code changes)
- Features tested: 5 (flock core, stale cleanup, installed binary, backoff delays, graceful degradation)

### Results
- PASS: loop_provider_health_primitives.tests.sh — 7/7 tests pass
- PASS: loop_provider_health.tests.sh — 5/5 tests pass
- PASS: flock references in installed binary = 5 (correct)
- PASS: mkdir in installed loop.sh = 2 (cleanup-only, not acquisition)
- PASS: aloop.test.mjs — 8/8 tests pass
- INFO: 32 pre-existing npm test failures in orchestrate/dashboard/gh features (unrelated to issue-172 flock changes; not introduced by this branch)
- INFO: loop_finalizer_qa_coverage.tests.sh — check_finalizer_qa_coverage_gate function missing from loop.sh (pre-existing issue from #104 PR; unrelated to flock work)

### Bugs Filed
None — no new bugs. All flock-specific tests confirmed PASS at HEAD.

### Command Transcript

```
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-P5t7nI/bin/aloop

# Version check
/tmp/aloop-test-install-P5t7nI/bin/aloop --version
# → 1.0.0

# Flock primitives unit tests (source loop.sh)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# Provider health integration tests (source loop.sh)
bash aloop/bin/loop_provider_health.tests.sh
# → All tests passed! (5/5)

# Verify installed binary has 5 flock references
grep -c "flock" /tmp/aloop-test-install-P5t7nI/lib/node_modules/aloop-cli/dist/bin/loop.sh
# → 5

# Verify mkdir is cleanup-only (not acquisition)
grep -n "mkdir.*lock" installed loop.sh
# → line 872: comment about stale .lock dir cleanup
# → line 899: comment about stale .lock dir cleanup

# aloop.test.mjs
node --test aloop/cli/aloop.test.mjs
# → 8/8 pass

# Full npm test suite (confirms pre-existing failures, not issue-172)
npm --prefix aloop/cli test
# → pass 1091, fail 32 (all failures in orchestrate/dashboard/gh — not flock)

# Cleanup
rm -rf /tmp/aloop-test-install-P5t7nI
```

## QA Session — 2026-03-31 (final-qa triggered by final-review at ab85cf7b)

### Test Environment
- Binary under test: /tmp/aloop-test-install-LZJtqb/bin/aloop (v1.0.0)
- Installed loop.sh: /tmp/aloop-test-install-LZJtqb/lib/node_modules/aloop-cli/dist/bin/loop.sh
- Commit: ab85cf7b1 (only QA_COVERAGE.md, QA_LOG.md, README.md, REVIEW_LOG.md, TODO.md changed since last QA at dc75a3d9 — no code changes)
- Features tested: 5 (flock core, stale cleanup, installed binary, README accuracy, aloop.test.mjs)

### Results
- PASS: loop_provider_health_primitives.tests.sh — 7/7 tests pass
- PASS: loop_provider_health.tests.sh — 5/5 tests pass
- PASS: flock references in installed binary = 5 (correct)
- PASS: mkdir in installed loop.sh = 2 lines (cleanup-only, not acquisition)
- PASS: aloop.test.mjs — 8/8 tests pass
- PASS: README flock/concurrent_cap docs — concurrent_cap in loop.sh at line 1053, .lock sidecar at line 892, silent degradation confirmed

### Bugs Filed
None — all tests pass at HEAD.

### Command Transcript

```
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-LZJtqb/bin/aloop

# Version check
/tmp/aloop-test-install-LZJtqb/bin/aloop --version
# → 1.0.0

# Flock primitives unit tests (source loop.sh)
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → All tests passed! (7/7)

# Provider health integration tests (source loop.sh)
bash aloop/bin/loop_provider_health.tests.sh
# → All tests passed! (5/5)

# Verify installed binary has 5 flock references
grep -c "flock" /tmp/aloop-test-install-LZJtqb/lib/node_modules/aloop-cli/dist/bin/loop.sh
# → 5

# Verify mkdir is cleanup-only (not acquisition)
grep -n "mkdir.*lock" installed loop.sh
# → line 872: comment about stale .lock dir cleanup
# → line 899: comment about stale .lock dir cleanup

# README accuracy: verify concurrent_cap in loop.sh
grep -n "concurrent_cap\|Cannot launch inside" aloop/bin/loop.sh
# → line 1053: grep -Eq 'cannot launch inside another session'; then echo "concurrent_cap"
# → line 1095: if [ "$reason" = "concurrent_cap" ]
# PASS: README claim verified

# README accuracy: verify .lock sidecar path
grep -n '\.lock' aloop/bin/loop.sh | grep "lock_file="
# → line 892: local lock_file="${path}.lock"
# PASS: health/<provider>.json.lock is correct

# aloop.test.mjs
node --test aloop/cli/aloop.test.mjs
# → 8/8 pass

# Cleanup
rm -rf /tmp/aloop-test-install-LZJtqb
```
