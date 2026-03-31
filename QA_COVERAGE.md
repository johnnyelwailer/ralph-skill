# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| flock-based lock acquire/release | 2026-03-31 | 4e33972 | PASS | All 7 unit tests pass (source + installed binary) — re-confirmed final-qa |
| Stale .lock directory cleanup | 2026-03-31 | 4e33972 | PASS | ensure_provider_health_dir() removes old mkdir dirs — confirmed against installed binary |
| Concurrent shared reads compatible | 2026-03-31 | 4e33972 | PASS | flock -s allows multiple simultaneous readers |
| Exclusive lock blocks shared | 2026-03-31 | 4e33972 | PASS | flock -x blocks concurrent shared lock attempts |
| Progressive backoff on contention | 2026-03-31 | 4e33972 | PASS | 5 retries with 50/100/150/200/250ms delays |
| Graceful degradation on lock failure | 2026-03-31 | 4e33972 | PASS | Returns 1, logs health_lock_failed, no crash |
| loop.sh bundled in npm package | 2026-03-31 | 4e33972 | PASS | dist/bin/loop.sh present with all flock functions |
| No mkdir-based lock acquisition | 2026-03-31 | 4e33972 | PASS | mkdir only for cleanup of stale dirs, not for locking |
| SPEC.md vs implementation discrepancy | 2026-03-31 | 4e33972 | INFO | SPEC now updated to reflect .lock/dynamic FD; tracked in TODO.md as low priority |
