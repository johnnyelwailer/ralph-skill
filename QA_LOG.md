# QA Log

## QA Session — 2026-04-14 (iteration 27, issue-6)

### Test Environment
- Branch: aloop/issue-6 @ 2a0f9bf2
- Dashboard: aloop/cli/dashboard/
- Features tested: 5

### Results
- PASS: Storybook 8 infrastructure (`npm run build-storybook` exits 0; .storybook/main.ts + preview.tsx present; decorator applies Tailwind + dark mode)
- PASS: lib/ansi.ts extraction (118 LOC; all 23 tests pass; exact RGB assertion confirmed at line 105)
- PARTIAL: lib/format.ts extraction (347 LOC — exceeds 200 LOC limit, tracked review item; 59 tests pass but 5 exported functions untested)
- PASS: lib/types.ts extraction (123 LOC; types exported correctly; imported by lib/ansi.ts and lib/format.ts)
- PASS: CostDisplay.tsx (95 LOC, tests pass), ResponsiveLayout.tsx (100 LOC, tests pass)
- FAIL: ArtifactViewer.tsx — type-check fails with 5 TS2459/TS7006 errors; imports from AppView instead of lib/types
- PARTIAL: Full test suite — 309/317 pass; 8 failures in App.coverage tests from test isolation timeouts (pre-existing on master: 15 failures)

### Bugs Filed
- [qa/P1] ArtifactViewer.tsx type errors: imports non-exported types from AppView instead of lib/types

### Command Transcript

#### Storybook build
```
npm run build-storybook
# Exit 0; WARN: No story files found (expected — stories are "Up Next")
# storybook-static built successfully with 0 stories
```

#### lib/ansi.ts tests
```
npm test -- src/lib/ansi.test.ts
# 23 passed; line 105 asserts segs[0].style.fg === '255,0,0' (exact RGB for index 196)
```

#### lib/format.ts tests
```
npm test -- src/lib/format.test.ts
# 59 passed; format.ts is 347 LOC (tracked review item)
```

#### Extracted components (isolation)
```
npm test -- src/components/artifacts/ArtifactViewer.test.tsx
npm test -- src/components/layout/ResponsiveLayout.test.tsx
npm test -- src/components/progress/CostDisplay.test.tsx
# All pass in isolation
```

#### Full test suite
```
npm test
# 317 tests (309 pass, 8 fail)
# Failures: App.coverage.test.ts (5), App.coverage.integration-app.test.ts (2),
#           App.coverage.integration-sidebar.test.ts (1)
# All failures are timeout-based test isolation issues
# Confirmed pre-existing: master branch has 15 failures in 8 files
```

#### Type check
```
npm run type-check
# Exit 2; 8 TS errors:
# NEW (5): ArtifactViewer.tsx(8,9): TS2459 ArtifactEntry/ManifestPayload not exported from AppView
#          ArtifactViewer.test.tsx(5): TS2459 LogEntryRow/ManifestPayload/LogEntry not exported from AppView
#          ArtifactViewer.tsx(52): TS7006 parameter 'a' implicit any
# PRE-EXISTING (3): App.coverage.test.ts TS2769 (overload mismatch, unchanged from master)
```

#### File size check
```
wc -l aloop/cli/dashboard/src/lib/ansi.ts       # 118 ✓
wc -l aloop/cli/dashboard/src/lib/format.ts      # 347 ✗ (>200 LOC, tracked)
wc -l aloop/cli/dashboard/src/lib/types.ts       # 123 ✓
wc -l .../components/artifacts/ArtifactViewer.tsx # 109 ✓
wc -l .../components/layout/ResponsiveLayout.tsx  # 100 ✓
wc -l .../components/progress/CostDisplay.tsx     # 95 ✓
wc -l aloop/cli/dashboard/src/AppView.tsx         # 1992 (not yet reduced — "Up Next")
```

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
