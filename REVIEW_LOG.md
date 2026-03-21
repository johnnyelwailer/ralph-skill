# Review Log

## Review — 2026-03-21 21:45 — commit 219bddf..48a98ef

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** orchestrate.ts, process-requests.ts, orchestrate.test.ts, process-requests.test.ts

- Gate 4 (Bug, high): `computeFreeBytesFromStatfs` at `orchestrate.ts:264` — `freeBytes <= 0n` returns `null` when disk is 100% full (bavail=0). Since `getTmpFreeBytes` propagates `null` and the dispatch gate checks `freeBytes !== null`, a genuinely full disk bypasses the safety gate entirely. The gate exists to prevent dispatch when /tmp is full, but the zero-free-bytes case is treated as "no data available" rather than "disk full". Fix: `freeBytes < 0n` (or separate `blockSize === 0n` guard).
- Gate 4 (medium): `dispatchChildLoops` at `orchestrate.ts:3101-3106` pauses dispatch silently with no log event when /tmp is low. `runOrchestratorScanPass` at `orchestrate.ts:5201-5208` correctly logs `scan_dispatch_paused_tmp_low_space`. Inconsistent observability.

**Notes on passing gates:**
- Gate 1: Implementation matches spec intent — NODE_COMPILE_CACHE set, periodic pruning, disk space gating all present.
- Gate 2: Tests assert exact values (`assert.equal(total, 3072)`, `assert.deepEqual(result, ...)`) — no shallow fakes.
- Gate 3: Helper functions have good coverage. Phase 2d integration and statfs utility edge cases have gaps, but the comprehensive test task is tracked in TODO.md "Up Next" — acceptable for now.
- Gate 5: Type check passes. 23 test failures are pre-existing (not introduced by this work). All 6 new tests pass.
- Gate 6: No proof manifest — work is purely internal plumbing (dispatch gating, cache pruning). Skipping proof is correct.
- Gate 7: N/A — no UI changes.
- Gate 8: N/A — no dependency changes.
- Gate 9: N/A — no user-facing docs to update. Spec gap already tracked.

---
