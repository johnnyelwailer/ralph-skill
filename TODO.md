# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Current Phase: Spec Update

### In Progress
(none)

### Up Next
(none)

### Completed (Spec Update)
- [x] [spec-gap] **P2** Update SPEC.md §Concurrency / File Locking to document both platform approaches: POSIX `flock -s`/`-x` for bash alongside the existing PowerShell `[System.IO.File]::Open()` / `FileShare` description.

### Completed
- [x] Replace `acquire_provider_health_lock()` and `release_provider_health_lock()` with `flock`-based locking — verified in `loop.sh:888-926`: uses `flock -s` for reads, `flock -x` for writes on FD 9, with 5-attempt retry and `health_lock_failed` log on failure
- [x] Add stale `.lock` directory cleanup in `ensure_provider_health_dir()` — verified in `loop.sh:870-876`: `find` removes old mkdir-based `.lock` dirs
- [x] Atomic write via tmp+mv pattern — verified in `loop.sh:1025-1029`: writes to `${path}.tmp.$$` then `mv` to final path
- [x] Verify existing provider health tests pass — commit message confirms all tests pass
