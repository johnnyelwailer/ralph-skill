## Summary

Replaces the fragile `mkdir`-based locking in `loop.sh` health file access with POSIX `flock`. This eliminates lock leaks (a crashed loop left its lock directory behind, permanently blocking all other loops) and enables true shared-read / exclusive-write semantics so multiple concurrent loops can read health state simultaneously without contention.

Also corrects documentation in SPEC.md and README.md to accurately reflect the implementation.

## Files Changed

- `aloop/bin/loop.sh` — replaced mkdir lock acquire/release with `flock -x`/`-s` on a `.lock` sidecar file; dynamic FD allocation via `exec {fd}>`; 5-attempt progressive backoff (50–250ms); stale `.lock` directory cleanup in `ensure_provider_health_dir()`
- `aloop/bin/loop_provider_health_primitives.tests.sh` — added tests for lock acquire/release cycle, lock failure path, and flock mode verification
- `aloop/bin/loop_provider_health.tests.sh` — updated tests to assert `flock -s`/`-x` flag presence
- `SPEC.md` — corrected flock sidecar file description (`.lock` extension, dynamic FD via `exec {fd}>`)
- `README.md` — corrected auth failure description (degraded state, no auto-recover)

## Verification

- [x] Writes use exclusive lock (`flock -x`) — verified by test asserting `-x` flag in captured flock args
- [x] Reads use shared lock (`flock -s`) — verified by test asserting `-s` flag in captured flock args
- [x] 5-attempt progressive backoff (50ms, 100ms, 150ms, 200ms, 250ms) — verified by lock failure test timing
- [x] Stale `.lock` directory cleanup in `ensure_provider_health_dir()` — verified by test pre-creating a `.lock` dir and confirming it's removed
- [x] Graceful degradation: lock failure returns rc=1 and logs `health_lock_failed` — verified by Test 7 (mock `flock` to always fail, assert return code 1 AND log event)
- [x] Acquire-release-re-acquire cycle works correctly — verified by Test 6
- [x] All-providers-cooldown sleep on lock failure — present in loop.sh round-robin logic
- [x] SPEC.md accurately documents the implementation — updated to use `.lock` extension and dynamic FD
- [x] README.md auth failure description accurate — updated to reflect `degraded` state (no auto-recover)
- [x] All 7 unit tests pass

## Proof Artifacts

No visual proof artifacts — this is an internal shell script concurrency mechanism change with no user-facing UI, API, or CLI behavioral changes. QA verified correctness through unit tests run against both source and installed binary.
