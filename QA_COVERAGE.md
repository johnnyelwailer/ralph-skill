# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI workflow file exists | 2026-04-13 | aloop/issue-22 | PASS | .github/workflows/ci.yml exists with 7 jobs, all referenced test files verified present |
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | aloop/issue-200 | PASS | Both push and pull_request have master, agent/*, aloop/* branches |
| CI 4 independent jobs (no needs) | 2026-04-13 | aloop/issue-200 | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests all present, no needs: |
| CI workflow name=CI (badge stable) | 2026-04-13 | aloop/issue-200 | PASS | name: CI on line 1 |
| CI cli-tests build excludes dashboard | 2026-04-13 | aloop/issue-200 | PASS | Explicit sub-commands: build:server, build:shebang, build:templates, build:bin, build:agents (no build:dashboard) |
| CI no dashboard-e2e job | 2026-04-13 | aloop/issue-200 | PASS | dashboard-e2e job absent; loop-script-tests has only 3 steps (checkout, install bats, run bats) |
| README CI badge URL | 2026-04-13 | aloop/issue-200 | PASS | Badge targets ci.yml/badge.svg for johnnyelwailer/ralph-skill |
| aloop CLI install from source | 2026-04-13 | aloop/issue-22 | PASS | npm test-install succeeds, binary runs, `aloop --version` = 1.0.0 |
| CI cli-tests job (`bun run test`) | 2026-04-13 | aloop/issue-22 | PASS | iter 4 static re-check: ci.yml now uses `bun run test` (not `bun test`); fix confirmed. Previously filed [qa/P1] resolved. |
| Dashboard unit tests (`npm test`) | 2026-04-13 | 0e6ea585 | PASS | 148 tests, 20 test files, all pass via vitest run |
| Loop bash script tests (from repo root) | 2026-04-13 | 0e6ea585 | PASS | loop.bats (15/15), json_escape, provider_health, branch_coverage all pass; provenance/path_hardening/finalizer have internal FAILs but exit 0 (pre-existing) |
| Dashboard E2E tests | 2026-04-13 | — | never | Requires Playwright; skipped this session |
| CLI type-check (`bun run type-check`) | 2026-04-13 | 0e6ea585 | FAIL | tsc --noEmit exits code 2: 2 errors in process-requests.ts (TS2367, TS2304). Bug filed [qa/P1] |
| Dashboard type-check (`npm run type-check`) | 2026-04-13 | 0e6ea585 | FAIL | tsc exits code 2: missing Vitest globals in App.coverage.test.ts, ArtifactEntry shape mismatch in App.test.tsx. Bug filed [qa/P1] |
| CLI tests (`bun run test`) | 2026-04-13 | 0e6ea585 | FAIL | 27 failures out of 922 tests via tsx --test; pre-existing test failures in codebase |
| Loop script tests (Windows/Pester) | 2026-04-13 | — | never | Requires Windows; skipped this session |
| Dashboard /api/state providerHealth key | 2026-04-14 | aloop/issue-2 | PASS | providerHealth present in response; provider entries (claude, openai, gemini, codex, opencode) have correct schema |
| Dashboard SSE state event providerHealth | 2026-04-14 | aloop/issue-2 | PASS | Initial SSE state event includes providerHealth with real health file data |
| aloop status provider health table | 2026-04-14 | 53e63ad7 | PARTIAL | Re-tested iter 2: hidden entry and 6 non-providers removed by fix, but claude-throttle-state, minimax-quota, opencode-throttle-state still appear (field overlap). Bug updated [qa/P1] |
| Provider health files at ~/.aloop/health/ | 2026-04-14 | aloop/issue-2 | PASS | Files exist for claude, openai, gemini, codex, opencode; correct schema with all 6 required fields; global (not session-specific) |
| providerHealth no non-provider file pollution | 2026-04-14 | 53e63ad7 | PARTIAL | Re-tested iter 2: partial fix — 6 non-providers removed, 3 remain (coincidental schema overlap). New bug filed [qa/P1] |
| Dashboard frontend uses state.providerHealth | 2026-04-14 | 53e63ad7 | FAIL | AppView.tsx still derives providerHealth from log (Lj/deriveProviderHealth). state.providerHealth from server not consumed. Pending task not yet implemented |
| Dashboard unit tests (issue-2 branch) | 2026-04-14 | 53e63ad7 | FAIL | 4 failures in App.coverage.test.ts + integration-sidebar.test.ts; 235 tests total (87 new). Bug filed [qa/P1] |
