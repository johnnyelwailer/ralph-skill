# Review Log

## Review — 2026-03-22 11:15 — commit efd0a467..9e7f35d0

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** aloop/bin/loop.ps1, aloop/bin/loop.sh, aloop/bin/loop.tests.ps1, README.md, SPEC.md, QA_COVERAGE.md, QA_LOG.md

- Gate 1: PASS — empty manifest rejection, proof mode failure tracking, per-iteration output capture all match spec intent
- Gate 2: PASS — tests assert exact values (`Should -Be $false`, `Should -Be 'invalid_json'`, `Should -Be 'proof'`), no shallow fakes; error paths (empty, whitespace, invalid JSON) tested
- Gate 3: PASS — new functions `Get-FileLengthSafe`/`Write-IterationRawOutput` exercised via integration test ("captures per-iteration provider output"); `proof-missing-manifest` scenario wired in fake providers but no dedicated test (acceptable — unit test covers missing-file path)
- Gate 4: PASS — no dead code, no leftover TODO/FIXME, no duplication
- Gate 5: PASS — npm test 8/8, tsc clean, build ok
- Gate 6: PASS (skip) — internal plumbing changes, no observable output to prove
- Gate 7: SKIP — no UI/layout changes
- Gate 8: SKIP — no dependency changes, no VERSIONS.md
- Gate 9: PASS — README.md and SPEC.md consistently updated 9→10 gates across all references
- Gate 10: **FAIL** — QA_COVERAGE.md: 2 PASS / 7 features = 28.6% < 30% threshold. Two `[qa/P1]` bugs newly filed (not stale). Root cause: proof-phase features BLOCKED because finalizer array empty in QA test harness.

---

## Review — 2026-03-22 12:00 — commit 9e7f35d0..bea6133d

**Verdict: PASS** (0 findings)
**Scope:** aloop/bin/loop.ps1, aloop/bin/loop.sh, QA_COVERAGE.md, QA_LOG.md, TODO.md

- Gate 1: PASS — proof skip protocol matches spec (SPEC.md:710 "empty artifacts and explanations in skipped", :726 "Proof skip is a valid outcome"); both `check_proof_skip` (loop.sh:629) and `Test-ProofSkip` (loop.ps1:908) parse `artifacts` array, extract `skipped` reasons, log `proof_skipped` event without failing iteration
- Gate 2: PASS — no new unit tests in scope; existing Pester tests assert exact values; runtime QA scenarios assert concrete log events (`event=proof_skipped`, `reason=internal_plumbing_no_ui`)
- Gate 3: PASS — new shell functions exercised via runtime QA (QA_LOG.md Runtime Tests A & B) and existing Pester suite (4/4 proof-manifest tests pass)
- Gate 4: PASS — no dead code, no leftover TODO/FIXME, no duplication; parallel implementations are language-appropriate (Python inline for bash, native PowerShell for .ps1)
- Gate 5: PASS — npm test 8/8, tsc --noEmit clean
- Gate 6: PASS (skip) — internal plumbing changes, root proof-manifest.json correctly has `{"artifacts": []}` skip format
- Gate 7: SKIP — no UI/layout changes
- Gate 8: SKIP — no dependency changes
- Gate 9: PASS — no behavioral changes to CLI, README unchanged, docs reflect current state
- Gate 10: PASS — QA coverage now 7 PASS / 11 features = 63.6% (above 30%); prior Gate 10 FAIL resolved (was 28.6%); two stale `[qa/P1]` bugs resolved (template placeholders PASS, baselines dir PASS); no stale P1 bugs remain

Prior review finding resolved: Gate 10 QA coverage moved from 28.6% → 63.6% after proof skip protocol enabled runtime QA testing of proof-phase features.

---

## Review — 2026-03-27 — commit 27beaa974..8f782ea43

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/bin/loop.sh, aloop/bin/loop.ps1, aloop/templates/subagent-hints-proof.md, QA_COVERAGE.md, QA_LOG.md, TASK_SPEC.md

Note: TODO.md and REVIEW_LOG.md were deleted in `fdf6bf07e` ("save work-in-progress before rebase"); recreated by this review.

Summary of what changed since last review:
- `790acbf78`: expanded subagent-hints-proof.md with vision-model delegation examples
- `b32cee65b`: spec-gap finding added to TODO.md (SPEC inconsistency)
- `fdf6bf07e`: TASK_SPEC.md updated with narrowed scope; TODO.md, REVIEW_LOG.md, QA_COVERAGE.md, QA_LOG.md deleted (rebase artifact)
- `0ca241668`: refactored loop.sh/loop.ps1 — removed `validate_proof_manifest`, `check_proof_skip`, `Validate-ProofManifest`, `Test-ProofSkip`; replaced with simple file-existence checks
- `8f782ea43`: QA session added QA_COVERAGE.md and QA_LOG.md

Gate 1: PASS — TASK_SPEC ACs 1-7 satisfied: iter-N created before invoke_provider (loop.sh:2228, loop.ps1:2341); baselines/ at session init (loop.sh:1946, loop.ps1:1980); existence-only manifest check (loop.sh:2244-2255); no JSON parsing; subagent-hints-proof.md has delegation examples. bash -n syntax check passes. Minor: model name in subagent-hints-proof.md says "Gemini Flash Lite" but vision-reviewer.md frontmatter has `openrouter/google/gemini-3.1-flash-lite-preview` — omits version and preview suffix.

Gate 2: **FAIL** — `loop.tests.ps1` not updated after refactor. `Describe 'loop.ps1 — Validate-ProofManifest'` (loop.tests.ps1:434) tests a function removed from loop.ps1 — will throw at BeforeAll. Integration tests at lines 250-297 and 1067-1092 assert `proof_manifest_validated` event (replaced by `proof_manifest_found`/`proof_manifest_missing`) and `iteration_error` with `proof_manifest_invalid_json` (no longer possible). New events have zero tests.

Gate 3: FAIL (same cause as Gate 2) — `proof_manifest_found` and `proof_manifest_missing` events have no test coverage.

Gate 4: FAIL — `loop.tests.ps1` dead code: `Describe 'loop.ps1 — Validate-ProofManifest'` block and stale integration test assertions for removed behavior.

Gate 5: PASS — npm test: 32 failures (pre-existing, same as at last review commit 27beaa974); tsc --noEmit clean. Pester tests not in CI but would fail if run.

Gate 6: **FAIL** — QA agent (commit `8f782ea43`) violated CONSTITUTION rule 16: all PASS results derived from `sed`/`grep` source-code inspection, not behavioral testing. Behavioral proof for `proof_manifest_found`/`proof_manifest_missing` events marked PARTIAL/BLOCKED. QA session results are not valid proof.

Gate 7: SKIP — no UI/layout changes.

Gate 8: SKIP — no dependency changes.

Gate 9: PASS — README, SPEC, SPEC-ADDENDUM have no stale references to removed functions. No behavioral documentation changed.

Gate 10: CONDITIONAL — QA_COVERAGE.md shows 8 PASS / 10 features = 80%, but QA results derived from source inspection (Gate 6 FAIL invalidates QA evidence). If QA source-reading results are excluded, coverage is unverifiable. Not failing independently since the spec-gap finding is the root cause blocker.

---

## Review — 2026-03-27 — commit 11739028f..b99c24992

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** aloop/bin/loop.tests.ps1, SPEC.md, QA_COVERAGE.md, QA_LOG.md, TODO.md

Summary of what changed since last review (11739028f):
- `fd4a70cfd`: test: update loop.tests.ps1 for proof manifest existence-only check — addressed prior Gate 2/3/4 finding
- `94604040f`: fix(spec): correct 9 stale references placing proof in continuous cycle — addressed prior spec-gap task
- `b99c24992`: QA iter-22 behavioral re-test — addressed prior Gate 6 QA methodology finding (partially)

Gate 1: PASS — Test changes correctly implement all 4 items in the review task spec: Validate-ProofManifest block deleted, proof_manifest_validated assertions replaced with proof_manifest_found, invalid-manifest failure tests replaced with proof_manifest_missing no-error tests, new events have dedicated coverage. SPEC.md corrections are internally consistent with authoritative design (lines 404, 407, 420).

Gate 2: PASS — New tests assert specific, concrete values. `proof manifest found logs event details` (loop.tests.ps1:252/1003) checks `$found.iteration > 0` and `$found.last_proof_iteration == $found.iteration` — not just existence. `proof_manifest_missing does not cause iteration_error` (loop.tests.ps1:273/1024) asserts specific event count and confirms zero iteration_error entries.

Gate 3: PASS — Both `proof_manifest_found` and `proof_manifest_missing` events now have coverage in bash (Sh-family, lines 252-289) and ps1 (lines 1003-1039) integration tests.

Gate 4: **FAIL** — `loop.tests.ps1:91` (bash fake provider) and `loop.tests.ps1:751` (ps1 fake provider): `proof-invalid-manifest` scenario branches are now dead code. The only test that created an env with this scenario was deleted in `fd4a70cfd`. These branches can never execute.

Gate 5: PASS — `npm test`: 1091 pass / 32 fail (same 32 pre-existing failures as prior reviews); `tsc --noEmit` clean; build succeeds.

Gate 6: PASS (skip for fd4a70cfd and 94604040f — internal plumbing and doc fixes, no observable output). QA iter-22 (b99c24992) uses behavioral-only testing; methodology disclosed, minor `grep loop.sh` for event name lookup disclosed as not affecting PASS/FAIL conclusions. Remaining proof_manifest event verification is BLOCKED (environmental: /tmp disk full) — ongoing [review] task in TODO.md.

Gate 7: SKIP — no UI/layout changes.

Gate 8: SKIP — no dependency changes.

Gate 9: PASS — SPEC.md corrections align spec with implementation. No user-facing behavioral docs or CLI commands changed.

Gate 10: PASS — QA_COVERAGE.md: 7 PASS / 15 features = 46.7% > 30%. No stale [qa/P1] bugs (only [qa/P2] filed this iteration, not stale).

Prior Gate 2/3/4 finding: RESOLVED. Prior Gate 6 finding: PARTIALLY addressed — behavioral re-test done for 3 of 5 features; proof_manifest events remain BLOCKED (environmental, not a code shortcut).

---
