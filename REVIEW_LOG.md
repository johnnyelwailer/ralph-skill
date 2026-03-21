# Review Log

## Review — 2026-03-21 19:15 — commit c35cb51..a43b4d8

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/cli/src/commands/orchestrate.ts, aloop/cli/src/commands/orchestrate.test.ts, aloop/bin/loop.sh

### Gate 1: Spec Compliance — FAIL (3 findings)
- `deriveFilterRepo` line 459: `GITHUB_REPOSITORY` env var only used when `GH_HOST` is also set (`if (envRepo && ghHost && ...)`). Spec says env vars should be an unconditional fallback. QA confirmed this bug independently.
- Startup health check only writes label self-healing results to `session-health.json`. Spec requires `gh auth status`, `gh repo view`, and `git status` checks — none implemented.
- No `ALERT.md` generation or non-zero exit on critical startup failures — spec explicitly requires both.
- What IS implemented correctly: label self-healing (`ensureLabels`), config derivation from `gh repo view`, git remote origin, and `meta.json` all work per spec.

### Gate 2: Test Depth — FAIL (1 finding)
- `deriveFilterRepo` env var test (line 322) sets both `GITHUB_REPOSITORY=derived/from-env` AND `GH_HOST=github.com`, which masks the production bug where `GH_HOST` is not set. Need a test with only `GITHUB_REPOSITORY` to catch the gate on line 459.
- Positive: `ensureLabels` tests (lines 6189-6243) cover all paths — create, skip, list-fail, partial-fail, all-exist — with specific value assertions. `deriveFilterRepo` tests assert exact repo slug values, not just truthiness.

### Gate 3: Coverage — PASS (conditional)
- `parseRepoFromRemoteUrl`: SCP and HTTPS paths tested indirectly through integration tests. Edge cases (empty string, malformed URL) handled in code but not directly tested — acceptable since the function is internal.
- `ensureLabels`: all branches covered.
- `toSpawnSyncResult`: exercised indirectly via all spawnSync-using tests.
- Coverage would likely meet 80% threshold given the test volume, but the env-var-without-GH_HOST path is completely uncovered (see Gate 2 finding).

### Gate 4: Code Quality — FAIL (1 finding)
- `runGh` helper duplicated near-identically in `deriveFilterRepo` (lines 373-396) and `deriveTrunkBranch` (lines 486-509). Same error handling, same spawnSync wrapping, same warn pattern.

### Gate 5: Integration Sanity — PASS
- 23 test failures are pre-existing on master (same count, same tests). No regressions introduced.
- Type-check passes. Build passes.

### Gate 6: Proof Verification — PASS (N/A)
- No proof manifest found. Work is purely internal (config derivation, label creation plumbing) — no observable UI/API output. Skipping proof is the expected correct outcome.

### Gate 7: Runtime Layout — SKIP
- No CSS/layout/UI changes.

### Gate 8: Version Compliance — PASS
- No dependency changes in orchestrate.ts/test.ts. Storybook devDeps added in commit 96414e8 are `@storybook/* 8.x` matching VERSIONS.md.

### Gate 9: Documentation Freshness — PASS
- Purely internal changes; no user-facing behavior changes requiring doc updates.

---
