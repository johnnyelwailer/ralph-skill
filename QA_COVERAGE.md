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
| Phase prerequisite checks (build/review) | 2026-04-16 | d45e7abd | PASS | loop_branch_coverage.tests.sh 52/52; check_phase_prerequisites forces plan on missing/empty TODO.md, forces build on no commits since lastPlanCommit |
| CLAUDECODE sanitization (CLI + loop.sh) | 2026-04-16 | d45e7abd | PASS | sanitize.test.ts 1/1 PASS; index.test.ts 5/6 PASS (1 pre-existing tsx-not-found env failure); loop.sh has unset CLAUDECODE at entry + env -u CLAUDECODE before each provider |
| compile-loop-plan finalizer section | 2026-04-16 | d45e7abd | PASS | 35/35 tests pass; tests 30-32 cover finalizer from pipeline.yml, empty finalizer, no pipeline.yml |
| loop.bats arg validation | 2026-04-16 | d45e7abd | PASS | 15/15 tests pass |
| loop_branch_coverage.tests.sh | 2026-04-16 | d45e7abd | PASS | 52/52 branches pass; covers phase prerequisites, cycle resolution, provider health, queue, advance_cycle_position |
| loop_finalizer_qa_coverage.tests.sh | 2026-04-16 | d45e7abd | FAIL | 4/4 tests FAIL: check_finalizer_qa_coverage_gate and append_plan_task_if_missing functions not found in loop.sh. Bug filed [qa/P1] |
| Branch sync (pre-iteration git fetch+merge) | 2026-04-16 | d45e7abd | FAIL | Not implemented in loop.sh: no git fetch/merge, no merge_conflict event, no conflict queueing. Bug filed [qa/P1] |
| Retry/cyclePosition tracking (MAX_PHASE_RETRIES, phase_retry_exhausted) | 2026-04-16 | d45e7abd | PASS | loop.sh has cyclePosition, advance_cycle_position, write_phase_retry_exhausted_entry, MAX_PHASE_RETRIES; no automated branch-coverage tests for these paths |
| Finalizer events (entered/aborted/completed) | 2026-04-16 | d45e7abd | PASS | loop.sh emits finalizer_entered, finalizer_aborted, finalizer_completed; no automated branch-coverage tests for these paths |
