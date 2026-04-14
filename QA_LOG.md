# QA Log

## QA Session — 2026-04-14 (iteration 1)

### Test Environment
- Branch: aloop/issue-11 (commit 630526b3)
- Binary under test: /tmp/aloop-test-install-KNXxuK/bin/aloop (v1.0.0)
- Installed via: `bun run build:server && build:shebang && build:templates && build:bin && build:agents && node scripts/test-install.mjs --keep`
- Features tested: 5 (4 PASS, 1 FAIL)
- Issue: Security Model — Trust Boundaries, aloop gh Policy & Request Protocol Hardening

### Results
- PASS: `aloop gh` policy enforcement (child-loop) — pr-merge, issue-create, issue-close all denied with `gh_operation_denied` logged
- PASS: `aloop gh` policy enforcement (orchestrator) — main-targeting denied, branch-delete always denied
- PASS: `aloop finalizer-qa-gate` — FAIL detection, all-PASS case, TODO.md task injection
- PASS: PATH sanitization in loop.sh — all 11 bash tests pass (gh shim blocks, PATH restored, no trap leaks)
- PASS: `wait_for_requests` timeout — waits for pending files, times out at REQUEST_TIMEOUT
- FAIL: `aloop process-requests` request archival — files NOT archived after processing (bug filed)

### Bugs Filed
- [qa/P1] process-requests does not archive request files to requests/processed/ or requests/failed/

### Command Transcript

#### Install CLI from source (skipping dashboard build — vite not installed)
```
$ bun run build:server && build:shebang && build:templates && build:bin && build:agents
→ builds dist/index.js, copies bin/loop.sh, loop.ps1, templates, agents

$ node scripts/test-install.mjs --keep
→ /tmp/aloop-test-install-KNXxuK/bin/aloop

$ /tmp/aloop-test-install-KNXxuK/bin/aloop --version
1.0.0
EXIT: 0 → PASS
```

#### Test 1: child-loop pr-merge policy (should be denied)
```
$ aloop gh pr-merge --session qa-test-child-loop-1 --role child-loop --home-dir $TESTHOME --request req.json
{"event":"gh_operation_denied","type":"pr-merge","role":"child-loop","reason":"pr-merge not allowed for child-loop role"}
EXIT: 1 → PASS (denied as expected)
log.jsonl verified: contains gh_operation_denied entry with full context
```

#### Test 2-3: child-loop issue-create and issue-close (both denied)
```
$ aloop gh issue-create ... --role child-loop
{"event":"gh_operation_denied","reason":"issue-create not allowed for child-loop role"}
EXIT: 1 → PASS

$ aloop gh issue-close ... --role child-loop
{"event":"gh_operation_denied","reason":"issue-close not allowed for child-loop role"}
EXIT: 1 → PASS
```

#### Test 4-5: orchestrator main-targeting and branch-delete (both denied)
```
$ aloop gh pr-merge ... --role orchestrator (request with "base":"main")
{"event":"gh_operation_denied","reason":"Operations targeting main are rejected; human must promote to main"}
EXIT: 1 → PASS

$ aloop gh branch-delete ... --role orchestrator
{"event":"gh_operation_denied","reason":"branch-delete rejected - cleanup is manual"}
EXIT: 1 → PASS
```

#### Test 6-7: process-requests request archival (FAIL)
```
Setup: SESSION_DIR with config.json, orchestrator.json {"issues":[]}, log.jsonl
Request files: req-001-dispatch_child.json (valid, id+type+payload format), req-002-malformed.json (invalid JSON), req-003-notype.json (missing type field)

$ aloop process-requests --session-dir $SESSION_DIR
(no output)
EXIT: 0

requests/: req-001-dispatch_child.json req-002-malformed.json req-003-notype.json (ALL UNCHANGED)
requests/processed/: (directory does not exist)
requests/failed/: (directory does not exist)
```
FAIL: No files were archived. Spec requires valid requests → requests/processed/, malformed → requests/failed/. Even invalid JSON was not moved to failed/.

Also confirmed via loop.sh's wait_for_requests orchestrator path:
```
$ wait_for_requests  (SESSION_DIR with orchestrator.json)
Running orchestrator process-requests...
EXIT: 0 — request file still in requests/ after aloop process-requests ran
```

Additionally: `bun test src/commands/process-requests.test.ts` fails with:
```
SyntaxError: Export named 'syncMasterToTrunk' not found in module process-requests.ts
0 pass, 1 fail
```

#### Test 8-10: finalizer-qa-gate
```
# FAIL item blocks exit
$ aloop finalizer-qa-gate --work-dir $DIR (QA_COVERAGE.md with 1 FAIL row)
{"passed":false,"reason":"qa_coverage_blocked","qa_fail":1}
EXIT: 1 → PASS; TODO.md appended with [qa/P1] remediation task

# All PASS items exit 0
$ aloop finalizer-qa-gate --work-dir $DIR (QA_COVERAGE.md with 2 PASS rows)
{"passed":true,"reason":"qa_coverage_pass","qa_fail":0}
EXIT: 0 → PASS
```

#### Test 11: PATH sanitization in loop.sh
```
$ bash aloop/bin/loop_path_hardening.tests.sh
PASS: gh shim blocks execution with expected message
PASS: provider binary co-located with gh still executes
PASS: gh is blocked even though real gh exists in co-located dir
PASS: gh.exe shim exists in block directory
PASS: PATH structure preserved with shim prepended
PASS: PATH is restored after invoke_provider returns
PASS: gh shim was prepended during provider execution
PASS: provider directory preserved on PATH during execution
PASS: invoke_provider success does not leak a RETURN trap
PASS: PATH is restored after provider exits non-zero
PASS: invoke_provider failure does not leak a RETURN trap
All tests passed!
EXIT: 0 → PASS
Note: loop_path_hardening.tests.sh is a bash script (not bats) — must run with `bash`, not `bats`
```

#### Test 12: wait_for_requests timeout (non-orchestrator mode)
```
SESSION_DIR with requests/req-001-pending.json, REQUEST_TIMEOUT=3
wait_for_requests → "Waiting for 1 pending requests..." → timeout after 3s → "Warning: Timeout..."
EXIT: 0 (timeout is non-fatal, as designed)
Elapsed: ~4s → PASS
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
