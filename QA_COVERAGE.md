# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| flock-based lock acquire/release | 2026-03-31 | 16ebaddd | PASS | All 7 unit tests pass (source + installed binary) — re-confirmed at final HEAD |
| Stale .lock directory cleanup | 2026-03-31 | 16ebaddd | PASS | ensure_provider_health_dir() removes old mkdir dirs — confirmed against installed binary |
| Concurrent shared reads compatible | 2026-03-31 | a4ed87d | PASS | flock -s allows multiple simultaneous readers |
| Exclusive lock blocks shared | 2026-03-31 | a4ed87d | PASS | flock -x blocks concurrent shared lock attempts |
| Progressive backoff on contention | 2026-03-31 | a4ed87d | PASS | 5 retries with 50/100/150/200/250ms delays |
| Graceful degradation on lock failure | 2026-03-31 | a4ed87d | PASS | Returns 1, logs health_lock_failed, no crash |
| loop.sh bundled in npm package | 2026-03-31 | 16ebaddd | PASS | dist/bin/loop.sh present with all flock functions |
| No mkdir-based lock acquisition | 2026-03-31 | 16ebaddd | PASS | mkdir only for cleanup of stale dirs, not for locking |
| README CLI examples accuracy | 2026-03-31 | a4ed87d | PASS | aloop start --launch resume <id> and opencode run (stdin) both match actual CLI |
| SPEC.md vs implementation discrepancy | 2026-03-31 | a4ed87d | INFO | SPEC now updated to reflect .lock/dynamic FD; tracked in TODO.md as low priority |
