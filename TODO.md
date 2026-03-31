# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Tasks

- [x] Implement as described in the issue
- [ ] [review] Gate 9: SPEC.md line 160 says "`.flock` sidecar file (FD 9)" but implementation uses `.lock` extension (`lock_file="${path}.lock"`) and dynamic FD allocation (`exec {fd}>`), not hardcoded FD 9 — update SPEC.md to accurately describe what was implemented (priority: low)
