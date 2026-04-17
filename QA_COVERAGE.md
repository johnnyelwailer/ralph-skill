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
| CLI type-check (`bun run type-check`) | 2026-04-17 | d263e4fd | FAIL | 6 errors (improved from 9 at iter 1): TS2339 round_robin_order×2 fixed (d263e4fd), TS2367 review fixed (cead4460). Remaining: TS2304 state×3, TS2552 roundRobinOrder, TS2304 provider×2. Bugs still open [qa/P1] |
| Dashboard type-check (`npm run type-check`) | 2026-04-13 | 0e6ea585 | FAIL | tsc exits code 2: missing Vitest globals in App.coverage.test.ts, ArtifactEntry shape mismatch in App.test.tsx. Bug filed [qa/P1] |
| aloop orchestrate --output json lifecycle | 2026-04-17 | 76205850 | PASS | Returns in 99ms with non-null pid; active.json has pid/session_dir/work_dir/mode:orchestrate; --no-task-exit in spawn args; aloop stop kills process and clears active.json |
| aloop process-requests validation | 2026-04-17 | 76205850 | PASS | Malformed JSON → requests/failed/; unknown type → requests/failed/ with structured log entry (type, id, error); valid schema with missing field → requests/failed/ with validation error |
| requests.test.ts unit tests | 2026-04-17 | 76205850 | PASS | 82/82 pass including idempotency tests |
| process-requests.test.ts unit tests | 2026-04-17 | 76205850 | PASS | 21/21 pass |
| adapter.test.ts unit tests | 2026-04-17 | 76205850 | PASS | 25/25 pass |
| orchestrate.test.ts unit tests | 2026-04-17 | d263e4fd | FAIL | 25/346 fail (no change from iter 1): launchChildLoop (14), dispatchChildLoops (7), runOrchestratorScanPass (2), processQueuedPrompts (2). Bugs still open [qa/P1] |
| CLI tests (`bun run test`) | 2026-04-13 | 0e6ea585 | FAIL | 27 failures out of 922 tests via tsx --test; pre-existing test failures in codebase |
| Loop script tests (Windows/Pester) | 2026-04-13 | — | never | Requires Windows; skipped this session |
| loop.sh --no-task-exit flag | 2026-04-17 | d263e4fd | PASS | Flag present in loop.sh (3 occurrences of NO_TASK_EXIT); accepted without error when passed to loop.sh |
| process-requests reconcile stale child sessions | 2026-04-17 | d263e4fd | PASS | process-requests.test.ts 21/21 pass; includes "Reconciled 1 stale running child status files" test |
