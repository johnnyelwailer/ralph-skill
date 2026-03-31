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

## Review — 2026-03-31 — commit ff3a74059..8b42f9e4c

**Verdict: PASS** (prior Gate 9 finding resolved)
**Scope:** `SPEC.md`, `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`

### Prior Finding Resolution
Gate 9 FAIL from previous review: SPEC.md line 160 said `.flock` extension and FD 9. Now reads: "Exclusive lock via `flock -x` on a `.lock` sidecar file (dynamic FD via `exec {fd}>`)" — matches `loop.sh:892` (`lock_file="${path}.lock"`) and `loop.sh:904` (`exec {fd}>"$lock_file"`) exactly. ✓

### Gate 1 — Spec Compliance: PASS
SPEC.md now accurately documents the implementation. All previously-verified requirements (flock -s reads, flock -x writes, 5-attempt backoff, stale-dir cleanup, graceful degradation) remain correct.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
Documentation-only changes. No dead code introduced. One minor cosmetic note: `QA_COVERAGE.md` still contains a stale INFO row "SPEC says .flock/FD9, impl uses .lock/dynamic FD" that was the pre-fix state — not a blocking issue (internal QA log, not user-facing).

### Gate 5 — Integration Sanity: PASS
7/7 bash tests pass (`loop_provider_health_primitives.tests.sh`) — verified in this review run.

### Gate 6 — Proof Verification: PASS
`artifacts/iter-proof/proof-manifest.json` correctly skips with empty artifacts array. Documentation-only fixes have no observable behavior change — skipping proof is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
- `SPEC.md` flock sidecar description corrected: `.lock` extension + dynamic FD ✓
- `README.md` auth failure description corrected: `degraded` (no auto-recover, requires user action) — matches `loop.sh:1092-1093` (`reason = "auth"` → `new_status = "degraded"`) ✓

---

## Review — 2026-03-31 — commit 4e339725c..2943bf920

**Verdict: PASS** (final-review, all 10 gates pass)
**Scope:** `QA_COVERAGE.md`, `QA_LOG.md`, `README.md`

### Prior Finding Resolution
All prior findings resolved. No open `[review]` tasks remain in TODO.md.

### Gate 1 — Spec Compliance: PASS
Documentation-only changes. Flock implementation was already spec-compliant per prior reviews.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md` stale INFO row ("SPEC says .flock/FD9, impl uses .lock/dynamic FD") corrected to reflect resolved state. No dead code or copy-paste.

### Gate 5 — Integration Sanity: PASS
7/7 bash tests pass — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
No observable behavior changes. Documentation-only — empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
- `aloop start --launch resume <session-id>` — confirmed correct against `aloop start --help` (flag: `--launch`, positional arg for session-id) ✓
- OpenCode autonomous invocation: `run` (prompt via stdin) — confirmed correct against `loop.sh:1393` (`echo "$prompt_content" | ... opencode run`) ✓
- Prior README auth failure fix and SPEC.md flock description carry over correctly.

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 8/8 features PASS (all at commit `4e33972`). No `[qa/P1]` bugs in TODO.md.

---

## Review — 2026-03-31 — commit a4ed87d2d..1e60bc905

**Verdict: PASS** (all 10 gates pass, triggered by spec-review)
**Scope:** `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`

### Prior Finding Resolution
No open `[review]` tasks. All prior findings resolved.

### Gate 1 — Spec Compliance: PASS
Documentation-only changes. Flock implementation spec-compliant per all prior reviews.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md` commit reference updated from `4e33972` to `a4ed87d`; new `README CLI examples accuracy` row added. `QA_LOG.md` new session entry accurately records re-run scope. No dead code or duplication.

### Gate 5 — Integration Sanity: PASS
7/7 primitives tests + 5/5 flock tests pass at HEAD — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
Documentation-only changes. Empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
Three README corrections verified against actual source files:
- Model names `gemini-3.1-flash-lite-preview` ✓ matches `.opencode/agents/error-analyst.md` and `vision-reviewer.md`
- `code-critic` fully read-only (bash: false, write: false, edit: false) ✓ matches `.opencode/agents/code-critic.md`
- `error-analyst` + `vision-reviewer` have bash enabled, no write/edit ✓ verified in agent frontmatter
- `aloop active` command: `aloop/cli/src/commands/active.ts` exists ✓

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 9 features PASS + 1 INFO at commit `a4ed87d`. No `[qa/P1]` bugs in TODO.md.

---

## Review — 2026-03-31 — commit dc75a3d92..421546387

**Verdict: PASS** (all 10 gates pass — spec-review triggered)
**Scope:** `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`

### Prior Finding Resolution
No open `[review]` tasks. All prior findings resolved.

### Gate 1 — Spec Compliance: PASS
Documentation-only changes. README concurrent_cap description "short cooldown and automatically retried" ✓ matches SPEC line 152 (`cooldown (short — 2 min)`) and `loop.sh:1095-1096` (`cooldown_secs=120`). Flock/graceful degradation descriptions match SPEC lines 157-171.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md` commit refs updated from `16ebaddd` to `dc75a3d9` — accurate. `QA_LOG.md` new session entry correctly records scope. README additions concise with no duplication.

### Gate 5 — Integration Sanity: PASS
7/7 `loop_provider_health_primitives.tests.sh` + 5/5 `loop_provider_health.tests.sh` pass at HEAD — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
Documentation-only changes. Empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
- README `.json.lock` sidecar ✓ matches `lock_file="${path}.lock"` (`loop.sh:892`)
- README ".NET file locking (PowerShell)" ✓ verified against `loop.ps1:1274-1285` (`[System.IO.File]::Open()` with `FileShare.None` writes, `FileShare.Read` reads)
- README `concurrent_cap` "short cooldown" ✓ confirmed `loop.sh:1095-1096` sets `cooldown_secs=120`
- README "skipped silently" — acceptable user-facing simplification; impl does log `health_lock_failed` but loop doesn't fail visibly ✓

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 9 PASS + 1 INFO at HEAD. No `[qa/P1]` bugs in TODO.md.

---

## Review — 2026-03-31 — commit 16ebaddd8..2ee390ca8

**Verdict: PASS** (all 10 gates pass — final QA re-run)
**Scope:** `QA_COVERAGE.md`, `QA_LOG.md`

### Prior Finding Resolution
No open `[review]` tasks. All prior findings resolved.

### Gate 1 — Spec Compliance: PASS
Internal QA tracking documents only. No spec-covered code changed.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md`: 4 commit references updated from `a4ed87d` to `16ebaddd` — accurately reflects re-validation at final HEAD. `QA_LOG.md` new session entry correctly records scope (4 features re-tested), results (all PASS), and command transcript. No dead code, no duplication.

### Gate 5 — Integration Sanity: PASS
7/7 `loop_provider_health_primitives.tests.sh` tests pass + 5/5 `loop_provider_health.tests.sh` tests pass — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
No new observable behavior. Empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
No user-facing docs changed. `QA_COVERAGE.md` and `QA_LOG.md` are internal tracking files.

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 9 PASS + 1 INFO at HEAD (`16ebaddd`). QA_LOG.md session confirms flock acquire/release, stale .lock cleanup, npm bundle, and no-mkdir-acquisition all re-validated at HEAD.

---

## Review — 2026-03-31 — commit ab85cf7b1..2b1b20e8f

**Verdict: PASS** (all 10 gates pass — spec-review re-run + flock/util-linux prereq docs)
**Scope:** `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

### Prior Finding Resolution
No open `[review]` tasks. All prior findings resolved.

### Gate 1 — Spec Compliance: PASS
Documentation-only changes. Flock implementation verified spec-compliant per all prior reviews (SPEC.md lines 157–175).

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md`: commit refs updated from `dc75a3d9`/`a4ed87d` to `ab85cf7b`; "README CLI examples accuracy" row renamed to "README flock/concurrent_cap docs". The renamed row now covers concurrent_cap cooldown, .lock sidecar, and silent degradation. The prior CLI examples content (`aloop start --launch resume <id>`, `opencode run` stdin) was validated in an earlier session — README has not changed for those. No dead code, no duplication.

### Gate 5 — Integration Sanity: PASS
7/7 `loop_provider_health_primitives.tests.sh` + 5/5 `loop_provider_health.tests.sh` pass at HEAD — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
Documentation-only changes. Empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
- `README.md` adds `flock (util-linux)` prerequisite row ✓ — `loop.sh:906` calls `flock` directly; util-linux is the correct package (`brew install util-linux` on macOS) ✓
- `QA_LOG.md` new session entry: correct scope (5 features re-tested), correct results (all PASS), transcript matches actual verification steps ✓

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 9 PASS + 1 INFO at HEAD (`ab85cf7b`). No `[qa/P1]` bugs in TODO.md.

---

## Review — 2026-03-31 — commit 2b1b20e8f..0df8923e0

**Verdict: PASS** (all 10 gates pass — spec-review triggered, README steer/devcontainer docs fix)
**Scope:** `README.md`, `QA_COVERAGE.md`, `QA_LOG.md`, `TODO.md`

### Prior Finding Resolution
No open `[review]` tasks. All prior findings resolved.

### Gate 1 — Spec Compliance: PASS
Documentation-only changes. Flock implementation spec-compliant per all prior reviews. No locking code changed.

### Gate 2 — Test Depth: PASS (no test changes)

### Gate 3 — Coverage: PASS (no code changes)

### Gate 4 — Code Quality: PASS
`QA_COVERAGE.md` commit ref updated from `ab85cf7b` to `c55f0c8`. `QA_LOG.md` new session records re-validation scope. README two-line fix: `aloop steer <instruction>` arg syntax and `/aloop:devcontainer` slash command row added. No dead code, no duplication.

### Gate 5 — Integration Sanity: PASS
7/7 `loop_provider_health_primitives.tests.sh` + 5/5 `loop_provider_health.tests.sh` pass at HEAD — verified directly in this review run.

### Gate 6 — Proof Verification: PASS
Documentation-only changes. Empty proof artifacts is the correct outcome.

### Gate 7 — Runtime Layout: N/A

### Gate 8 — Version Compliance: N/A

### Gate 9 — Documentation Freshness: PASS
- `aloop steer <instruction>` ✓ — `steer.ts:42` signature `steerCommand(instruction: string, ...)` confirms positional argument
- `/aloop:devcontainer` ✓ — `claude/commands/aloop/devcontainer.md` and `aloop/cli/src/commands/devcontainer.ts` both exist

### Gate 10 — QA Coverage: PASS
`QA_COVERAGE.md`: 9 PASS + 1 INFO at HEAD (`c55f0c8`). No `[qa/P1]` bugs in TODO.md.

---
