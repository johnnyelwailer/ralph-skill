# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Tasks

- [x] Implement as described in the issue
- [x] [review] Gate 9: SPEC.md line 160 says "`.flock` sidecar file (FD 9)" but implementation uses `.lock` extension (`lock_file="${path}.lock"`) and dynamic FD allocation (`exec {fd}>`), not hardcoded FD 9 — update SPEC.md to accurately describe what was implemented (priority: low)

spec-gap analysis: no discrepancies found — spec fully fulfilled

spec-review (2026-03-31): all flock locking requirements confirmed implemented — writes use flock -x, reads use flock -s, 5-attempt backoff (50–250ms), stale-dir cleanup, health_lock_failed logged on failure, all-providers-cooldown sleep — APPROVED

[reviewed: gates 1-9 pass — 2026-03-31]
[final-review: gates 1-10 pass — 2026-03-31]
