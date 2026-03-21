# Sub-Spec: Issue #172 — Replace mkdir locking with POSIX flock in loop.sh health file access

Part of #24: Epic: Provider Health & Rate-Limit Resilience

## Objective

Upgrade the provider health file locking in `loop.sh` from the current `mkdir`-based atomic lock to POSIX `flock(2)` for proper shared/exclusive semantics.

## Context

The current implementation uses `mkdir`/`rmdir` as a lock primitive. While atomic, it doesn't support shared-read/exclusive-write semantics and is vulnerable to stale locks if a process crashes. POSIX `flock` provides proper file locking with automatic cleanup on process exit.

## Inputs
- Current `acquire_health_lock()` and `release_health_lock()` functions in `loop.sh` (lines ~879-906)
- Health files at `~/.aloop/health/<provider>.json`

## Deliverables
- Replace `mkdir`-based locking with `flock -x` (exclusive) for writes and `flock -s` (shared) for reads
- Maintain 5-attempt progressive backoff (50ms, 100ms, 150ms, 200ms, 250ms)
- Graceful degradation: if lock fails after all retries, skip health update, log `health_lock_failed`, continue
- Clean up any stale `.lock` directories from the old approach
- No changes to `loop.ps1` — it already uses `System.IO.File.Open()` with `FileShare.None` which is correct for Windows

## Acceptance Criteria
- [ ] `flock -x` used for all health file writes
- [ ] `flock -s` used for all health file reads
- [ ] 5-attempt retry with progressive backoff preserved
- [ ] Lock failure logs `health_lock_failed` and continues without corruption
- [ ] Stale `.lock` directories cleaned up on first run
- [ ] Existing provider health tests pass

## Files
- `aloop/bin/loop.sh`

## Existing Issue
#41

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
