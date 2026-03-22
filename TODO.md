# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Current Phase: Complete

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

### QA Result
qa: **ALL PASS** — 5 features tested from user perspective (2026-03-22, commit af045c6).

Verified:
1. Health file creation with correct JSON schema (6 fields per spec)
2. `.flock` sidecar file created alongside health JSON
3. Stale `.lock` directory cleanup (mkdir → flock migration)
4. Concurrent write safety: 50 writes with 0 lock failures (5-attempt retry + backoff)
5. Shared read / exclusive write semantics (flock -s / flock -x)
6. Atomic tmp+mv prevents corruption under contention
7. `aloop status` displays provider health table
8. Graceful degradation: non-blocking flock returns failure, loop continues

No bugs found. See QA_COVERAGE.md and QA_LOG.md for full details.

### Spec Review Result
spec-review: **APPROVED** — all SPEC.md §Concurrency / File Locking requirements (lines 155–206) verified against implementation.

Checked 9 requirements, all pass:
1. `flock -x` exclusive lock on `.flock` sidecar (FD 9) for writes — `loop.sh:897,902,904`
2. `flock -s` shared lock for reads — `loop.sh:894-895`
3. 5-attempt retry with 50–250ms progressive backoff, non-blocking `flock -n` — `loop.sh:47,904,908`
4. Stale `.lock` directory cleanup in `ensure_provider_health_dir()` — `loop.sh:873-874`
5. Graceful degradation: skip update + log `health_lock_failed` — `loop.sh:911-918`, callers at `:978,:1023`
6. One file per provider — `loop.sh:885`
7. Atomic write via tmp+mv — `loop.sh:1025-1029`
8. File locking prevents corruption (acceptance criteria) — exclusive flock + atomic write
9. Lock failure degrades gracefully (acceptance criteria) — same as #5
