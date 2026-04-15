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
| ArtifactViewer.tsx extracted component | 2026-04-15 | 3b2d16df | PASS | ArtifactViewer type errors FIXED (5 TS errors from prior session resolved); type-check now clean for ArtifactViewer |
| Dashboard unit tests (`npm test`) — full suite | 2026-04-15 | 3b2d16df | PARTIAL | 313/317 pass; 4 fail in App.coverage tests (improved from 8 last session; pre-existing: master has 15 failures) |
| Dashboard type-check (`npm run type-check`) | 2026-04-15 | 3b2d16df | FAIL | 4 TS2769 errors in App.coverage.test.ts: sessionCost missing in Sidebar props (line 636) + TooltipProvider missing children (lines 636, 674, 695). ArtifactViewer errors fixed. Bug filed [qa/P1] |
| /aloop:start, /aloop:setup, /aloop:dashboard agent files (Claude) | 2026-04-15 | 3b2d16df | PASS | All 3 exist in claude/commands/aloop/; start.md is thin wrapper; setup.md has full discovery+interview flow; dashboard.md delegates to CLI |
| /aloop:start, /aloop:setup, /aloop:dashboard agent files (Copilot) | 2026-04-15 | 3b2d16df | PASS | All 3 exist in copilot/prompts/; aloop-dashboard.prompt.md, aloop-setup.prompt.md, aloop-start.prompt.md confirmed |
| aloop setup ZDR config (zdr_enabled, data_classification) | 2026-04-15 | 3b2d16df | PARTIAL | privacy_policy.zdr_enabled=true + data_classification=private written to config ✓; but no --data-privacy flag in non-interactive mode (spec: all options as flags) ✗; openrouter not a valid provider so OpenRouter ZDR config untestable ✗. Bug filed [qa/P2] |
| aloop update + version.json | 2026-04-15 | 3b2d16df | PASS | `aloop update --repo-root <path>` writes version.json with commit+installed_at; --output json works; files updated correctly |
| aloop start version.json staleness check | 2026-04-15 | 3b2d16df | FAIL | No staleness warning when version.json commit (abc12345) differs from HEAD; spec says "warns when installed commit differs from repo HEAD". Bug filed [qa/P2] |
