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
| Storybook 8 infrastructure (`npm run build-storybook`) | 2026-04-14 | 2a0f9bf2 | PASS | Builds successfully; .storybook/main.ts + preview.tsx exist; Tailwind+dark mode decorator in place; 0 stories (stories are Up Next) |
| lib/ansi.ts extraction + ansi.test.ts | 2026-04-14 | 2a0f9bf2 | PASS | All 23 tests pass; exact RGB assertion at line 105 confirmed ('255,0,0' for index 196); 118 LOC |
| lib/format.ts extraction + format.test.ts | 2026-04-14 | 2a0f9bf2 | PARTIAL | 59 tests pass; format.ts is 347 LOC (>200 LOC limit, tracked review item); 5 exported functions untested (tracked review item) |
| lib/types.ts extraction | 2026-04-14 | 2a0f9bf2 | PASS | 123 LOC, types exported; ansi.ts and format.ts import from it correctly |
| CostDisplay.tsx extracted component | 2026-04-14 | 2a0f9bf2 | PASS | 95 LOC, tests pass in isolation |
| ResponsiveLayout.tsx extracted component | 2026-04-14 | 2a0f9bf2 | PASS | 100 LOC, tests pass in isolation |
| ArtifactViewer.tsx extracted component | 2026-04-14 | 2a0f9bf2 | FAIL | Tests pass but `npm run type-check` fails: ArtifactViewer.tsx imports ArtifactEntry/ManifestPayload from AppView (not exported); should import from lib/types. 5 TS errors. Bug filed [qa/P1] |
| Dashboard unit tests (`npm test`) — full suite | 2026-04-14 | 2a0f9bf2 | PARTIAL | 309/317 pass; 8 fail in 3 App.coverage test files due to test isolation timeouts (pre-existing: master has 15 failures in 8 files) |
| Dashboard type-check (`npm run type-check`) | 2026-04-14 | 2a0f9bf2 | FAIL | 8 TS errors: 5 new in ArtifactViewer.tsx/.test.tsx (bug filed [qa/P1]); 3 pre-existing TS2769 in App.coverage tests |
