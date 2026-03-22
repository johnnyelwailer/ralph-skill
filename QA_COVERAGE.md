# QA Coverage — Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Health file creation & format | 2026-03-22 | af045c6 | PASS | Health file created at `~/.aloop/health/claude.json` with all 6 required fields per spec. `.flock` sidecar file present. JSON valid. |
| flock -x exclusive write | 2026-03-22 | af045c6 | PASS | Shared read blocked during exclusive lock, succeeds after release. |
| flock -s shared read | 2026-03-22 | af045c6 | PASS | 3 concurrent shared readers all acquire lock simultaneously. |
| 5-attempt retry with progressive backoff | 2026-03-22 | af045c6 | PASS | 50 concurrent writes (5 writers × 10 iterations) with 0 lock failures using 5-attempt retry and 50–250ms backoff. |
| Stale .lock directory cleanup | 2026-03-22 | af045c6 | PASS | Created `claude.json.lock` and `codex.json.lock` dirs, both removed after `aloop start`. |
| Atomic write via tmp+mv | 2026-03-22 | af045c6 | PASS | No JSON corruption after 100 concurrent writes (5 writers × 20 iterations, no retry). File always valid JSON. |
| Graceful degradation (health_lock_failed) | 2026-03-22 | af045c6 | PASS | Non-blocking `flock -n` correctly returns failure when lock unavailable; loop continues. |
| aloop status shows provider health | 2026-03-22 | af045c6 | PASS | `aloop status` displays "Provider Health:" table with provider name and status. |
| One file per provider | 2026-03-22 | af045c6 | PASS | Only `claude.json` created when using `--provider claude`. Separate `.flock` sidecar per provider. |
