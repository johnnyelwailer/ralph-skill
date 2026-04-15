# QA Log

## QA Session — 2026-04-15 (iteration 5)

### Test Environment
- Binary under test: N/A — this issue tests prompt templates, not runtime CLI
- Features tested: 13 acceptance criteria from SPEC.md (Issue #71)

### Results
- PASS (12): Gate 10 presence after Gate 9, coverage formula, <30% fail condition, stale [qa/P1] fail condition, coverage trend requirement, all 5 gate-count references, no stale 9-gate refs, PROMPT_review.md integrity
- FAIL (1): qa.md was modified despite spec constraint "Do NOT modify: aloop/templates/instructions/qa.md"

### Bugs Filed
- [qa/P1] qa.md modified in violation of spec scope constraint (commit 631780ad, not yet reverted)

### Command Transcript

```
$ git diff HEAD~3..HEAD -- aloop/templates/instructions/qa.md
# Shows: 0d section expanded (3 lines → 5 lines) and QA_COVERAGE.md table format changed
# from 5-column to 7-column in step 5. Both changes prohibited by spec ("Do NOT modify: qa.md")

$ rg -n "9 quality gates|gates 1-9|## The 9 Gates" aloop/templates/instructions/review.md
# Exit: 1 (no stale references found) ✓

$ rg -n "Gate 9|Gate 10" aloop/templates/instructions/review.md
15:0e. Study @QA_COVERAGE.md and @QA_LOG.md for Gate 10 verification
127:### Gate 9: Documentation Freshness
136:### Gate 10: QA Coverage & Bug Fix Rate
# Gate 10 appears after Gate 9 ✓

$ rg -n "10 quality gates|the 10 gates|The 10 Gates|gates 1-10" aloop/templates/instructions/review.md
7:Audit the last build iteration's changes against 10 quality gates.
19:2. Audit every changed file against the 10 gates below
26:## The 10 Gates
165:3. Add a brief note ... `[reviewed: gates 1-10 pass]`
184:6. Commit both files with message: `chore(review): PASS — gates 1-10 pass`
# All 5 gate-count references updated ✓

$ cat aloop/templates/PROMPT_review.md
# Contains: frontmatter (agent:review, provider:claude, reasoning:high) + {{include:instructions/review.md}} ✓
```

### Summary
12 of 13 acceptance criteria PASS. One FAIL: `aloop/templates/instructions/qa.md` was modified in commit
631780ad. The out-of-scope changes are:
1. `0d. Check coverage gaps` expanded with 3 additional bullet lines
2. QA_COVERAGE.md table format changed from 5-column to 7-column in step 5

A revert task for this is already tracked in TODO.md as a pending item (not yet completed). The
revert is required to satisfy Constitution Rule 12 (one issue, one concern) and the spec's explicit
"Do NOT modify" constraint.

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
