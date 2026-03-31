# Review Log

## Review — 2026-03-31 — commit c805d8db1..dad6a7107

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop_provider_health.tests.sh`, `aloop/bin/loop_provider_health_primitives.tests.sh`, `SPEC.md`

### Gate 1 — Spec Compliance: PASS
Implementation matches spec intent: `flock -s` for reads, `flock -x` for writes, 5 retries with progressive backoff (50ms→250ms), graceful degradation with `health_lock_failed` log event. Stale `.lock` directory cleanup present in both `ensure_provider_health_dir()` and `acquire_provider_health_lock()`. Constitution rule 1 (no new functions without authorization) is satisfied — new `acquire_provider_health_lock` and `release_provider_health_lock` functions are directly required by the issue.

### Gate 2 — Test Depth: PASS
- `loop_provider_health_primitives.tests.sh` Test 4 (lines 114–132): asserts all 6 parsed JSON fields with exact values after reading a concrete health file — thorough.
- Test 5 (lines 137–152): full round-trip write+read verifying all 6 fields — leaves no wiggle room.
- Test 7 (lines 184–201): mocks `flock` to always fail, asserts return code 1 AND `health_lock_failed` log event — covers the error path.
- `loop_provider_health.tests.sh`: flock mode tests assert exact `-s`/`-x` flag presence in captured args, not just truthy.

### Gate 3 — Coverage: PASS
All code paths in the new functions exercised: read path (shared lock), write path (exclusive lock), lock failure path (all retries exhausted), acquire-release-re-acquire cycle. `ensure_provider_health_dir` cleanup path covered implicitly by test setup.

### Gate 4 — Code Quality: PASS
No dead code, no unused imports, no copy-paste duplication. Dynamic FD allocation (`exec {fd}>`) is idiomatic bash — better than hardcoded FD 9. `release_provider_health_lock` correctly closes FD and clears `HEALTH_LOCK_FD`. No over-engineering.

### Gate 5 — Integration Sanity: PASS
Both test suites run clean (12 tests total, all PASS). No TypeScript changes in this PR — CLI type-check not applicable.

### Gate 6 — Proof Verification: PASS
`artifacts/iter-proof/proof-manifest.json` correctly skips with an empty artifacts array and a precise reason (internal shell locking refactor, no observable behavior change). This is the expected correct outcome for internal plumbing changes.

### Gate 7 — Runtime Layout: N/A (no UI changes)

### Gate 8 — Version Compliance: N/A (no dependency changes)

### Gate 9 — Documentation Freshness: FAIL
SPEC.md line 160 (added in commit `d7949e9c7`) says:
> "Exclusive lock via `flock -x` on a `.flock` sidecar file (FD 9)"

Actual implementation in `loop.sh:892`: `lock_file="${path}.lock"` (extension `.lock`, not `.flock`) and `exec {fd}>"$lock_file"` (dynamic FD, not hardcoded FD 9). The documentation doesn't match what was implemented. `[review]` task written to TODO.md.

---
