# QA Log

## QA Session — 2026-04-16 (iteration 2, issue-23)

### Test Environment
- Branch: aloop/issue-23
- Commit: c549c3e5
- Binary under test: /tmp/aloop-test-install-H0zThl/bin/aloop (v1.0.0)
- Features tested: 5

### Results
- FAIL: loop_finalizer_qa_coverage.tests.sh — still failing (re-test); check_finalizer_qa_coverage_gate and append_plan_task_if_missing still absent from loop.sh
- FAIL: Branch sync — still not implemented in loop.sh (re-test confirms no git fetch/merge/merge_conflict)
- FAIL: Steering queue cyclePosition reset — NOT implemented; run_queue_if_present identifies steering items but never resets CYCLE_POSITION=0 after execution; already tracked as open High TODO
- PASS: Provider stderr capture — tmp_stderr captured, LAST_PROVIDER_ERROR includes stderr on failure; loop_branch_coverage.tests.sh 52/52
- PASS: Queue override priority — run_queue_if_present called before cycle/finalizer dispatch in main loop

### Bugs Filed
(none new — 2 previously filed bugs still open; steering reset is tracked as open TODO item, not a new QA bug)

### Command Transcript

#### 1. CLI install from source
```
npm run test-install -- --keep → /tmp/aloop-test-install-H0zThl/bin/aloop
aloop --version → 1.0.0
EXIT: 0 (PASS)
```

#### 2. loop_finalizer_qa_coverage.tests.sh (re-test)
```
bash aloop/bin/loop_finalizer_qa_coverage.tests.sh
→ line 65: check_finalizer_qa_coverage_gate: command not found
→ FAIL: finalizer QA gate passes at <=30% untested and 0 fail
→ FAIL: should append untested coverage blocker task
→ PASS: finalizer QA gate blocks when untested >30% (coincidental — fn missing, non-zero return)
→ FAIL: should append fail item task
→ PASS: finalizer QA gate blocks when FAIL rows exist (same coincidental pass)
→ FAIL: gate should return success when QA_COVERAGE.md is missing
→ FAIL: finalizer QA gate skips enforcement when QA_COVERAGE.md is missing
EXIT: 1 (FAIL — still failing, same root cause as iter 1)
```

#### 3. Branch sync check (re-test)
```
grep "git fetch\|git merge\|merge_conflict\|branch_sync" aloop/bin/loop.sh → (empty output)
EXIT: MISSING IMPLEMENTATION (same as iter 1)
```

#### 4. Steering queue cyclePosition reset
```
grep -n "cyclePosition.*0\|CYCLE_POSITION.*0\|steer" aloop/bin/loop.sh
→ Lines 2084-2085: QUEUE_ITEM finds *-PROMPT_steer.md and *-steering.md (identifies steering items)
→ Lines 2119-2130: successful steering path → no CYCLE_POSITION=0 reset, no loop-plan.json update
→ Spec: "Steering queue execution resets cyclePosition to 0 (plan restart point)"
Confirmed: steering reset NOT implemented. Already in open TODO.md High task list.
EXIT: FAIL (spec mismatch confirmed)
```

#### 5. Provider stderr capture (first explicit test)
```
grep -n "LAST_PROVIDER_ERROR\|tmp_stderr\|tmp_stdout" aloop/bin/loop.sh
→ line 1343-1346: tmp_stderr/tmp_stdout mktemp'd
→ line 1382: LAST_PROVIDER_ERROR="claude exited with code $exit_code. Stderr: $(cat "$tmp_stderr") Stdout: $(cat "$tmp_stdout")"
→ line 1404: LAST_PROVIDER_ERROR="codex exited with code $exit_code. Stderr: $(cat "$tmp_stderr")"
→ Similar pattern for all providers

bash aloop/bin/loop_branch_coverage.tests.sh
→ Branch coverage summary: 52/52 (100%)
→ Includes path.invoke.failure test (line 364): invoke_provider failure branch captures "claude exited with code 3" in LAST_PROVIDER_ERROR
EXIT: 0 (PASS)
```

#### 6. Queue override priority (first explicit test)
```
grep -n "run_queue_if_present\|resolve_iteration_mode" aloop/bin/loop.sh
→ line 2171: if run_queue_if_present "$iter_provider"; then continue; fi
→ line ~2194: resolve_iteration_mode "$ITERATION" (cycle dispatch — called AFTER queue check)
→ line ~2177: finalizer dispatch — also AFTER queue check
Pattern confirms: queue checked first; if queue item found, `continue` skips cycle entirely.
EXIT: PASS
```

---

## QA Session — 2026-04-16 (iteration 1, issue-23)

### Test Environment
- Branch: aloop/issue-23
- Commit: d45e7abd
- Binary under test: /tmp/aloop-test-install-H9gu4U/bin/aloop (v1.0.0)
- Features tested: 5

### Results
- PASS: Phase prerequisite checks (loop_branch_coverage.tests.sh 52/52)
- PASS: CLAUDECODE sanitization (sanitize.test.ts 1/1, index.test.ts 5/6 — 1 pre-existing tsx env failure unrelated to sanitization)
- PASS: compile-loop-plan finalizer section (35/35 tests)
- PASS: loop.bats arg validation (15/15)
- FAIL: loop_finalizer_qa_coverage.tests.sh — 4/4 fail: `check_finalizer_qa_coverage_gate` and `append_plan_task_if_missing` don't exist in loop.sh
- FAIL: Branch sync — not implemented in loop.sh (no git fetch, no merge_conflict event, no conflict queuing)

### Bugs Filed
- [qa/P1] loop_finalizer_qa_coverage.tests.sh: check_finalizer_qa_coverage_gate and append_plan_task_if_missing command not found
- [qa/P1] Branch sync not implemented in loop.sh: no pre-iteration git fetch/merge, no merge_conflict log event

### Command Transcript

#### 1. CLI install from source
```
npm run test-install -- --keep
→ Binary: /tmp/aloop-test-install-H9gu4U/bin/aloop
→ aloop --version: 1.0.0
EXIT: 0
```

#### 2. loop.bats (arg validation)
```
bats aloop/bin/tests/loop.bats
→ 1..15, ok 1-15
EXIT: 0 (PASS)
```

#### 3. loop_branch_coverage.tests.sh
```
bash aloop/bin/loop_branch_coverage.tests.sh
→ 52/52 PASS (phase_prereq, cycle, provider, queue, advance_cycle_position)
→ Branch coverage summary: 52/52 (100%)
EXIT: 0 (PASS)
```

#### 4. loop_finalizer_qa_coverage.tests.sh
```
bash aloop/bin/loop_finalizer_qa_coverage.tests.sh
→ line 65: check_finalizer_qa_coverage_gate: command not found
→ FAIL: finalizer QA gate passes at <=30% untested and 0 fail
→ FAIL: should append untested coverage blocker task
→ FAIL: gate should return success (skip enforcement) when QA_COVERAGE.md is missing
→ FAIL: finalizer QA gate skips enforcement when QA_COVERAGE.md is missing
EXIT: 1 (FAIL)
```
Root cause: test file uses `eval "$(extract_func check_finalizer_qa_coverage_gate)"` but that function does not exist in loop.sh.

#### 5. compile-loop-plan tests
```
npx tsx --test src/commands/compile-loop-plan.test.ts
→ 35/35 PASS (includes tests 30-32 for finalizer)
EXIT: 0 (PASS)
```

#### 6. CLAUDECODE sanitization
```
npx tsx --test src/sanitize.test.ts → 1/1 PASS
npx tsx --test src/index.test.ts → 5/6 PASS (not ok 5: pre-existing tsx-not-found in temp dir)
grep unset CLAUDECODE aloop/bin/loop.sh → line 20: unset CLAUDECODE (entry), + env -u CLAUDECODE before each provider
EXIT: sanitization confirmed
```

#### 7. Branch sync check
```
grep "git fetch\|merge_conflict\|branch_sync\|BASE_BRANCH" aloop/bin/loop.sh → (empty)
→ No git fetch/merge/conflict-queue code in loop.sh
Spec requires: pre-iteration git fetch origin <base_branch>, merge, conflict→queue PROMPT_merge.md, log merge_conflict event
EXIT: MISSING IMPLEMENTATION
```

---

## QA Session — 2026-04-13 (iteration 4)

### Test Environment
- Branch: aloop/issue-22
- Binary under test: N/A — worktree deleted before binary install could complete
- Features tested: 1 (via static analysis only); all runtime tests blocked
- Note: Shell CWD was the worktree path that was deleted by the orchestrator between iterations. The bash tool failed on every invocation. All runtime verifications (CLI type-check, dashboard type-check, CLI tests, shell tests) were blocked.

### Results
- PASS (static): `bun run test` fix confirmed — ci.yml in aloop/issue-22 worktree uses `bun run test` (not `bun test`); previously filed [qa/P1] bug is resolved
- BLOCKED: CLI type-check, dashboard type-check, CLI tests, shell tests — bash environment broken; cannot re-verify remaining P1 bugs from iteration 3

### Bugs Filed
(none new — existing bugs from iteration 3 still open but could not be re-tested)

### Command Transcript

#### Static CI workflow verification
Read `.github/workflows/ci.yml` from worktree before deletion:
- Line 28: `run: bun run test` → PASS (fix confirmed, was `bun test` in prior iteration)
- 7 jobs present: cli-tests, cli-type-check, dashboard-tests, dashboard-type-check, loop-script-tests, dashboard-e2e, loop-script-tests-windows
- All 8 referenced shell test files verified present
EXIT: PASS (static analysis only)

#### Runtime test attempts
All blocked:
```
Working directory /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-22-20260413-194901/worktree no longer exists.
```
EXIT: BLOCKED

---

## QA Session — 2026-04-13 (iteration 1)

### Test Environment
- Branch: aloop/issue-22
- Binary under test: /tmp/aloop-test-install-2h638p/bin/aloop (v1.0.0)
- Features tested: 3 attempted (2 PASS, 1 FAIL, 2 blocked by env)
- Note: Session worktree was deleted mid-session by orchestrator, causing bash shell cwd to become invalid. Loop script tests and CLI type-check could not be completed.

### Results
- PASS: CI workflow file structure (all 7 jobs present, all referenced test files verified to exist)
- PASS: aloop CLI install from source (`test-install` succeeds, `aloop --version` = 1.0.0)
- FAIL: CI `cli-tests` job — `bun test` fails due to test runner incompatibility (bug filed)
- BLOCKED: Dashboard unit tests, loop bash tests, CLI type-check — could not run (shell env broken after background bun run test process changed cwd to deleted path)

### Bugs Filed
- [qa/P1] CI cli-tests job uses `bun test` instead of `bun run test` — wrong test runner

### Command Transcript

#### Install CLI from source
```
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
/tmp/aloop-test-install-2h638p/bin/aloop

$ /tmp/aloop-test-install-2h638p/bin/aloop --version
1.0.0
EXIT: 0 → PASS
```

#### Verify test files exist
All files referenced by ci.yml verified present:
- aloop/bin/tests/loop.bats ✓
- aloop/bin/loop_json_escape.tests.sh ✓
- aloop/bin/loop_path_hardening.tests.sh ✓
- aloop/bin/loop_provenance.tests.sh ✓
- aloop/bin/loop_provider_health_primitives.tests.sh ✓
- aloop/bin/loop_provider_health.tests.sh ✓
- aloop/bin/loop_branch_coverage.tests.sh ✓
- aloop/bin/loop_finalizer_qa_coverage.tests.sh ✓
- aloop/bin/loop.tests.ps1 ✓
EXIT: 0 → PASS

#### bun test (CI command for cli-tests job)
```
$ cd aloop/cli && bun test

aloop.test.mjs:
(fail) aloop entrypoint runs discover scaffold and resolve [5000.03ms]
  ^ this test timed out after 5000ms
AssertionError: Expected values to be strictly equal: null !== 0

src/parseTodoProgress.test.ts:
NotImplementedError: describe() inside another test() is not yet implemented in Bun.
Track the status at https://github.com/oven-sh/bun/issues/5090

src/index.test.ts:
NotImplementedError: test() inside another test() is not yet implemented in Bun.

src/sanitize.test.ts:
NotImplementedError: test() inside another test() is not yet implemented in Bun.

dashboard/src/App.coverage.integration-sidebar.test.ts:
ReferenceError: window is not defined

[multiple other TS test files fail with same NotImplementedError]
EXIT: 1 → FAIL
```

Root cause: The CI workflow uses `bun test` which invokes Bun's native test runner. The test files use `node:test` module format (importing `test`/`describe` from `node:test`). Bun's test runner does not support nesting `test()` inside another `test()` context when using `node:test` format.

The package.json `test` script correctly uses `tsx --test src/**/*.test.ts && node --test aloop.test.mjs` which uses Node's native test runner. The CI should use `bun run test` (runs the npm script) instead of `bun test` (Bun's own runner).

#### Environment failure
After running `bun run test` as a background command from aloop/cli, the background process completed and the shell's cwd became invalid (likely a temp directory was cleaned up). Subsequent bash commands failed with:
"Working directory .../worktree/aloop/cli no longer exists."
The worktree directory itself was then deleted (by orchestrator between iterations), making all further test runs impossible.

### Coverage gaps identified for next session
- Dashboard unit tests (npm test via vitest)
- Loop bash script tests (loop_branch_coverage, loop_finalizer_qa_coverage, etc.)
- CLI type-check
- Dashboard type-check
- bats-based loop.sh tests

---

## QA Session — 2026-04-13 (iteration 3)

### Test Environment
- Branch: aloop/issue-22 (commit 0e6ea585 — `fix(ci): use bun run test instead of bun test`)
- Binary under test: N/A — vite unavailable for test-install (dashboard deps not pre-installed); tested commands directly
- Features tested: 5 (2 PASS, 3 FAIL)
- Repo root used: /home/pj/dev/ralph-skill and clean git-archive of aloop/issue-22

### Results
- PASS: Dashboard unit tests (`npm test` in aloop/cli/dashboard) — 148 tests, 20 files, all pass
- PASS: Loop bash script tests (from repo root) — loop.bats 15/15, json_escape, provider_health, branch_coverage all pass
- FAIL: CLI type-check (`bun run type-check`) — exits code 2, 2 TypeScript errors in process-requests.ts
- FAIL: Dashboard type-check (`npm run type-check`) — exits code 2, missing Vitest globals + ArtifactEntry shape errors
- FAIL: CLI tests (`bun run test`) — exits code 1, 27 pre-existing failures in tsx --test

### Bugs Filed
- [qa/P1] CLI type-check CI job will fail — TS errors in process-requests.ts (TS2367, TS2304)
- [qa/P1] Dashboard type-check CI job will fail — missing Vitest globals + ArtifactEntry mismatch
- [qa/P1] CLI tests CI job will fail — 27 pre-existing test failures

### Command Transcript

#### Test 1: Dashboard unit tests
```
$ npm --prefix /home/pj/dev/ralph-skill/aloop/cli/dashboard ci
(npm ci succeeded)

$ npm --prefix /home/pj/dev/ralph-skill/aloop/cli/dashboard test
> aloop-dashboard@1.0.0 test
> vitest run

 Test Files  20 passed (20)
       Tests  148 passed (148)
    Duration  51.63s
EXIT: 0 → PASS
```

#### Test 2: Loop bash script tests (from repo root, using git-archive checkout of aloop/issue-22)
```
$ cd /tmp/tmp.fpTvGh9oVd && bats aloop/bin/tests/loop.bats
ok 1 through ok 15 — all pass
EXIT: 0 → PASS

$ bash aloop/bin/loop_json_escape.tests.sh
All tests passed!
EXIT: 0 → PASS

$ bash aloop/bin/loop_provider_health.tests.sh
All tests passed!
EXIT: 0 → PASS

$ bash aloop/bin/loop_branch_coverage.tests.sh
Branch coverage summary: 52/52 (100%)
EXIT: 0 → PASS

$ bash aloop/bin/loop_path_hardening.tests.sh
FAIL: provider directory was removed from PATH during execution
Some tests failed!
EXIT: 0 (script exits 0 even on failure — pre-existing issue in test script)

$ bash aloop/bin/loop_provenance.tests.sh
FAIL: loop.sh emitted top-level local warning
FAIL: Provenance trailers verification failed
EXIT: 0 (same issue — exits 0 on failure)

$ bash aloop/bin/loop_finalizer_qa_coverage.tests.sh
FAIL: gate should return success (skip enforcement) when QA_COVERAGE.md is missing
EXIT: 0 (same issue)
```
Note: path_hardening, provenance, and finalizer test scripts print "FAIL:" but return exit code 0 — CI would NOT detect these failures. Pre-existing issue in test scripts, not in CI config.

#### Test 3: CLI type-check
```
$ bun run type-check (in /home/pj/dev/ralph-skill/aloop/cli)
$ tsc --noEmit
src/commands/process-requests.ts(442,71): error TS2367: This comparison appears to be unintentional because the types '"failed" | "merged" | "pending"' and '"review"' have no overlap.
src/commands/process-requests.ts(818,25): error TS2304: Cannot find name 'sweepStaleRunningIssueStatuses'.
EXIT: 2 → FAIL
```
The cli-type-check CI job will fail on every run until these TS errors are fixed.

#### Test 4: Dashboard type-check
```
$ npm run type-check (in /home/pj/dev/ralph-skill/aloop/cli/dashboard, after npm ci)
src/App.coverage.test.ts(438,3): error TS2304: Cannot find name 'beforeEach'.
src/App.coverage.test.ts(440,5): error TS2304: Cannot find name 'vi'.
[...multiple similar errors for vi, beforeEach, afterEach in App.coverage.test.ts...]
src/App.test.tsx(500,28): error TS2345: Argument of type '{ path: string; type: string; }' is not assignable to parameter of type 'ArtifactEntry'.
  Property 'description' is missing in type '{ path: string; type: string; }' but required in type 'ArtifactEntry'.
EXIT: 2 → FAIL
```
Root cause: App.coverage.test.ts uses Vitest globals (vi, beforeEach, afterEach) but the tsconfig does not include `@vitest/globals` types. App.test.tsx has stale type usage against ArtifactEntry.

#### Test 5: CLI tests
```
$ bun run test (in /home/pj/dev/ralph-skill/aloop/cli)
(runs: tsx --test src/**/*.test.ts && node --test aloop.test.mjs)
# tests 922
# pass  895
# fail  27
EXIT: 1 → FAIL
```
27 pre-existing test failures in the CLI test suite. The cli-tests CI job will fail.

---

## QA Session — 2026-04-13 (iteration 2)

### Test Environment
- Branch: aloop/issue-200
- Binary under test: N/A — vite unavailable for full test-install; `npm run build:server` would require cd into worktree (worktree was cleaned up before binary could be tested)
- Features tested: 6 (all PASS)
- Note: Worktree at /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-200-20260413-132955/worktree was cleaned up during the session; files were read before cleanup. All CI workflow checks were conducted by reading .github/workflows/ci.yml from the worktree before it disappeared.

### Results
- PASS: CI workflow branch triggers — agent/*, aloop/* present in both push and pull_request
- PASS: All four jobs present and independent — type-check, cli-tests, dashboard-tests, loop-script-tests; no `needs:` keyword
- PASS: Workflow name is `CI` (badge stability confirmed)
- PASS: cli-tests build uses explicit sub-commands, excludes build:dashboard
- PASS: No dashboard-e2e job; loop-script-tests has only 3 steps
- PASS: README CI badge targets correct URL (ci.yml/badge.svg)

### Bugs Filed
(none — all checks passed)

### Command Transcript

#### Test 1: Branch triggers
Read .github/workflows/ci.yml lines 3-7:
```yaml
on:
  push:
    branches: ['master', 'agent/*', 'aloop/*']
  pull_request:
    branches: ['master', 'agent/*', 'aloop/*']
```
EXIT: PASS — both push and pull_request include agent/* and aloop/*

#### Test 2: Four independent jobs
Jobs found in ci.yml: type-check (line 14), cli-tests (line 45), dashboard-tests (line 70), loop-script-tests (line 91)
No `needs:` keyword found anywhere in file.
EXIT: PASS

#### Test 3: Workflow name
Line 1: `name: CI`
EXIT: PASS

#### Test 4: cli-tests build step
Line 64:
```
run: npm run clean && npm run build:server && npm run build:shebang && npm run build:templates && npm run build:bin && npm run build:agents
```
No build:dashboard present. All six sub-commands explicit.
EXIT: PASS

#### Test 5: No dashboard-e2e job
Searched full ci.yml for `dashboard-e2e:` — not found.
loop-script-tests has exactly 3 steps: checkout, install bats, run loop.sh tests.
EXIT: PASS

#### Test 6: README CI badge URL
Line 1 of README.md:
```
![CI](https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg)
```
EXIT: PASS
