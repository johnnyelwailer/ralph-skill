# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Current Phase: Implementation

### In Progress
(none)

### Up Next
(none)

### Completed
- [x] Replace `acquire_provider_health_lock()` and `release_provider_health_lock()` with `flock`-based locking
- [x] Add stale `.lock` directory cleanup in `ensure_provider_health_dir()`
- [x] Verify existing provider health tests pass

## Spec-Gap Analysis

- [ ] [spec-gap] **P2** SPEC.md §Concurrency / File Locking (lines 155–161) describes health file locking only in terms of PowerShell (`[System.IO.File]::Open()` / `FileShare`). Now that `loop.sh` uses POSIX `flock` (shared for reads, exclusive for writes), the spec should document both platform approaches. **Files:** `SPEC.md` lines 155–161, `aloop/bin/loop.sh` lines 888–926. **Suggested fix:** Update SPEC.md to list both: `flock -s`/`-x` for bash, `FileShare.Read`/`FileShare.None` for PowerShell.
