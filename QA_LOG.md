# QA Log

## QA Session — 2026-04-13 (iteration 1)

### Test Environment
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-22-20260413-195619/worktree (aloop/issue-22 @ 33cfe894)
- Branch: aloop/issue-22
- Features tested: 5 CI jobs + workflow structure
- Note: host session worktree was deleted mid-session; tests run against a parallel issue-22 worktree

### Binary under test
- No packaged binary tested (CI workflow is config, not a CLI command)
- Commands tested: bun run test, bun run type-check, npm test, npm run type-check, bash *.tests.sh, bats loop.bats

### Results
- PASS: cli-tests (452 tests, bun run test)
- PASS: cli-type-check (tsc --noEmit, exit 0)
- PASS: dashboard-tests (148 tests, 20 files, vitest run --run)
- PASS: dashboard-type-check (tsc --noEmit, exit 0)
- PASS: loop.bats (15/15)
- PASS: loop_json_escape.tests.sh
- PASS: loop_path_hardening.tests.sh
- PASS: loop_provider_health_primitives.tests.sh
- PASS: loop_provider_health.tests.sh
- PASS: loop_branch_coverage.tests.sh (52/52 branches)
- FAIL: loop_provenance.tests.sh — 2 assertions fail, but script exits 0
- FAIL: loop_finalizer_qa_coverage.tests.sh — 3 assertions fail (incl. command not found), but script exits 0
- SKIP: dashboard-e2e (Playwright browser required)
- SKIP: loop-script-tests-windows (Windows runner required)

### Bugs Filed
- [qa/P1] loop_provenance.tests.sh silent failures: 2 assertions fail but exit 0 masks from CI
- [qa/P1] loop_finalizer_qa_coverage.tests.sh silent failures: check_finalizer_qa_coverage_gate command not found + 2 assertion failures, but exit 0 masks from CI

### Command Transcript

**CI workflow file inspection:**
```
git show aloop/issue-22:.github/workflows/ci.yml
# → 7 jobs: cli-tests, cli-type-check, dashboard-tests, dashboard-type-check,
#   loop-script-tests, dashboard-e2e, loop-script-tests-windows
# → triggers: push [master, agent/*, aloop/*], PR [master, agent/*]
```

**cli-tests:**
```
cd aloop/cli && bun install --frozen-lockfile && bun run test
# → $ tsx --test src/**/*.test.ts && node --test aloop.test.mjs
# → 452 ok, 0 not ok
# EXIT: 0
```

**cli-type-check:**
```
cd aloop/cli && bun install --frozen-lockfile && bun run type-check
# → $ tsc --noEmit
# → (no output = no errors)
# EXIT: 0
```

**dashboard-tests:**
```
cd aloop/cli/dashboard && npm ci && npm test -- --run
# → vitest run --run
# → Test Files: 20 passed (20)
# → Tests: 148 passed (148)
# → Duration: 122.03s
# EXIT: 0
```

**dashboard-type-check:**
```
cd aloop/cli/dashboard && rm -rf node_modules && npm ci && npm run type-check
# → tsc --noEmit
# → (no output = no errors)
# EXIT: 0
```

**loop.bats:**
```
cd aloop/bin/tests && bats loop.bats
# → 1..15
# → ok 1 through ok 15
# EXIT: 0
```

**loop_json_escape.tests.sh:**
```
bash aloop/bin/loop_json_escape.tests.sh
# → PASS: Backslash, PASS: Newline, PASS: Tab, PASS: Mixed,
#   PASS: Empty input, PASS: Multiline stderr
# → All tests passed!
# EXIT: 0
```

**loop_path_hardening.tests.sh:**
```
bash aloop/bin/loop_path_hardening.tests.sh
# → PASS: provider directory preserved on PATH during execution
# → PASS: invoke_provider success does not leak a RETURN trap
# → PASS: PATH is restored after provider exits non-zero
# → PASS: invoke_provider failure does not leak a RETURN trap
# → All tests passed!
# EXIT: 0
```

**loop_provider_health_primitives.tests.sh:**
```
bash aloop/bin/loop_provider_health_primitives.tests.sh
# → PASS: get_provider_health_state reads and parses an existing file correctly
# → PASS: round-trip set/get_provider_health_state
# → PASS: acquire-release-re-acquire lock cycle
# → PASS: lock failure returns 1 and logs health_lock_failed
# → All tests passed!
# EXIT: 0
```

**loop_provider_health.tests.sh:**
```
bash aloop/bin/loop_provider_health.tests.sh
# → PASS: degraded provider is skipped with distinct log event
# → PASS: all degraded providers emit actionable signal
# → All tests passed!
# EXIT: 0
```

**loop_branch_coverage.tests.sh:**
```
bash aloop/bin/loop_branch_coverage.tests.sh
# → Branch coverage summary: 52/52 (100%)
# → Shell branch-coverage harness passed.
# EXIT: 0
```

**loop_provenance.tests.sh (FAIL — silent):**
```
bash aloop/bin/loop_provenance.tests.sh
# → Aloop-Iteration: 1
# → Aloop-Session: session
# → ---
# → FAIL: loop.sh emitted top-level local warning
# → FAIL: Provenance trailers verification failed
# → "provenance OK" (script continues despite failures)
# EXIT: 0  ← CI cannot detect these failures
```

**loop_finalizer_qa_coverage.tests.sh (FAIL — silent):**
```
bash aloop/bin/loop_finalizer_qa_coverage.tests.sh
# → FAIL: should append fail item task
# → PASS: finalizer QA gate blocks when FAIL rows exist
# → aloop/bin/loop_finalizer_qa_coverage.tests.sh: line 137:
#       check_finalizer_qa_coverage_gate: command not found
# → FAIL: gate should return success (skip enforcement) when QA_COVERAGE.md is missing
# → FAIL: finalizer QA gate skips enforcement when QA_COVERAGE.md is missing
# EXIT: 0  ← CI cannot detect these failures
```
