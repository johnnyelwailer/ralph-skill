# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Current Phase: Spec Update

### Spec-Gap Analysis Result
spec-gap analysis: no discrepancies found — spec fully fulfilled for issue #172 (flock locking).

All implementation details match SPEC.md §Concurrency / File Locking exactly:
- `flock -s`/`-x` on `.flock` sidecar (FD 9) ✓
- 5-attempt retry with 50–250ms progressive backoff ✓
- Non-blocking `flock -n` ✓
- Graceful degradation with `health_lock_failed` log ✓
- Stale `.lock` directory cleanup ✓
- Atomic write via tmp+mv ✓
- SPEC.md documents both bash and PowerShell approaches ✓

Note (out of scope, pre-existing): `loop.sh:1875` provider validation case is missing `opencode` — not related to this issue.

### Completed (Spec Update)
- [x] [spec-gap] **P2** Update SPEC.md §Concurrency / File Locking to document both platform approaches: POSIX `flock -s`/`-x` for bash alongside the existing PowerShell `[System.IO.File]::Open()` / `FileShare` description.

### Completed
- [x] Replace `acquire_provider_health_lock()` and `release_provider_health_lock()` with `flock`-based locking — verified in `loop.sh:888-926`: uses `flock -s` for reads, `flock -x` for writes on FD 9, with 5-attempt retry and `health_lock_failed` log on failure
- [x] Add stale `.lock` directory cleanup in `ensure_provider_health_dir()` — verified in `loop.sh:870-876`: `find` removes old mkdir-based `.lock` dirs
- [x] Atomic write via tmp+mv pattern — verified in `loop.sh:1025-1029`: writes to `${path}.tmp.$$` then `mv` to final path
- [x] Verify existing provider health tests pass — commit message confirms all tests pass
