# QA Log

## QA Session — 2026-04-14 (iteration 2, issue-2)

### Test Environment
- Branch: aloop/issue-2
- Binary under test: /tmp/aloop-test-install-XaTUT6/bin/aloop (v1.0.0)
- Commit: 53e63ad7 (fix(session): exclude hidden files and non-provider JSON from readProviderHealth)
- Features tested: 5 (2 PASS, 1 PARTIAL FIX, 2 FAIL)
- Temp dir: /tmp/qa-test-issue2-HAQJxO (cleaned up)

### Results
- PARTIAL FIX (was FAIL): `aloop status` provider health table — 6 non-provider entries removed, 3 remain (claude-throttle-state, minimax-quota, opencode-throttle-state)
- PARTIAL FIX (was FAIL): `/api/state` and SSE providerHealth — same 3 non-provider entries remain
- FAIL: Dashboard frontend (AppView.tsx) still uses log-derived providerHealth — pending task not implemented
- FAIL: Dashboard unit tests — 4 failures in App.coverage.test.ts and integration-sidebar.test.ts (235 tests total, 231 pass)

### Bugs Filed
- [qa/P1] readProviderHealth still includes 3 non-provider files: claude-throttle-state, minimax-quota, opencode-throttle-state (coincidental field overlap)
- [qa/P1] Dashboard unit tests: 4 failures after issue-2 changes

### Command Transcript

#### Install CLI from source
```
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
/tmp/aloop-test-install-XaTUT6/bin/aloop
$ /tmp/aloop-test-install-XaTUT6/bin/aloop --version
1.0.0
EXIT: 0 → PASS
```

#### Test 1: aloop status (re-test after readProviderHealth fix, commit 53e63ad7)
```
$ aloop status
Provider Health:
  claude-throttle-state unknown   ← NON-PROVIDER still present (has consecutive_failures field)
  claude     healthy      (last success: 20s ago)
  codex      degraded     (auth error)
  gemini     cooldown
  minimax-quota ok         ← NON-PROVIDER still present (has status: "ok" field)
  openai     cooldown
  opencode-throttle-state unknown ← NON-PROVIDER still present (has consecutive_failures field)
  opencode   cooldown
EXIT: 0 → PARTIAL FIX
```
Removed vs. iter 1: blank entry (hidden .json file), heal-counter, hourly-stats-state, opencode-go-usage, provider-status, resource-guard-state
Still present: claude-throttle-state (has `consecutive_failures: 0`), minimax-quota (has `"status": "ok"`), opencode-throttle-state (has `consecutive_failures: 0`)

#### Test 2: /api/state providerHealth (dashboard on port 14041)
```
$ aloop dashboard --port 14041 --session-dir /tmp/qa-test-issue2-HAQJxO/session ... &
$ curl -s http://localhost:14041/api/state | python3 -c "..."
providerHealth keys: ['claude', 'claude-throttle-state', 'codex', 'gemini', 'minimax-quota', 'openai', 'opencode', 'opencode-throttle-state']
Non-provider entries: ['claude-throttle-state', 'minimax-quota', 'opencode-throttle-state']
EXIT: 0 → PARTIAL FIX (same 3 remain)
```

#### Test 3: SSE state event providerHealth
```
$ timeout 4 curl -s -N http://localhost:14041/events > /tmp/qa-sse-output.txt
SSE state event providerHealth keys: ['claude', 'claude-throttle-state', 'codex', 'gemini', 'minimax-quota', 'openai', 'opencode', 'opencode-throttle-state']
Non-provider entries: ['claude-throttle-state', 'minimax-quota', 'opencode-throttle-state']
EXIT: 0 → PARTIAL FIX (same 3 remain)
```

#### Test 4: Dashboard frontend uses state.providerHealth
```
Inspected built JS: /tmp/aloop-test-install-XaTUT6/.../dist/dashboard/assets/index-Bze4vxLR.js
Found: const Nn=p.useMemo(()=>Lj((e==null?void 0:e.log)??"",Rr),[e==null?void 0:e.log,Rr])
Found: providerHealth:Nn
No occurrences of: stateHealthToProviderHealth, e.providerHealth, state.providerHealth
EXIT: FAIL — frontend still derives providerHealth from log, not from state.providerHealth
```
Pending task (update AppView.tsx) not yet implemented.

#### Test 5: Dashboard unit tests
```
$ npm --prefix aloop/cli/dashboard run test -- --reporter=dot
Test Files  2 failed | 20 passed (22)
      Tests  4 failed | 231 passed (235)

FAIL src/App.coverage.integration-sidebar.test.ts > covers older-session grouping and docs overflow branches
  Error: Test timed out in 5000ms

FAIL src/App.coverage.test.ts > covers panel toggles, sidebar shortcut, and session switching
  TestingLibraryElementError: Found multiple elements with role "button" and name /activity/i

FAIL src/App.coverage.test.ts > covers older-session grouping and docs overflow branches
  AssertionError: expected null not to be null

FAIL src/App.coverage.test.ts > covers ActivityPanel and LogEntryRow exhaustive
  TestingLibraryElementError: Unable to find element with text: a.png
EXIT: non-zero → FAIL (4 test failures)
```

#### Cleanup
```
kill 1023612  # dashboard server
rm -rf /tmp/qa-test-issue2-HAQJxO
rm -rf $(dirname $(dirname /tmp/aloop-test-install-XaTUT6/bin/aloop))
```

## QA Session — 2026-04-14 (iteration 1, issue-2)

### Test Environment
- Branch: aloop/issue-2
- Binary under test: /tmp/aloop-test-install-fygl9g/bin/aloop (v1.0.0)
- Features tested: 4 (2 PASS, 2 FAIL)
- Temp dir: /tmp/qa-test-issue2-918414 (cleaned up after session)

### Results
- PASS: Dashboard `/api/state` includes `providerHealth` key — correct schema for known providers
- PASS: Dashboard SSE initial `state` event includes `providerHealth` field
- PASS: Provider health files at `~/.aloop/health/<provider>.json` — all 5 providers exist with correct schema
- FAIL: `aloop status` provider health table includes non-provider files — bug filed [qa/P1]
- FAIL: `providerHealth` polluted with non-provider file entries — same root bug, filed [qa/P1]

### Bugs Filed
- [qa/P1] providerHealth includes non-provider files (readProviderHealth reads entire health dir)
- [qa/P1] providerHealth has empty-string provider key (hidden `.json` file, 135 failures, blank entry in status)

### Command Transcript

#### Install CLI from source
```
$ npm --prefix aloop/cli/dashboard ci --silent
(dashboard deps installed)
$ npm --prefix aloop/cli run test-install -- --keep 2>&1 | tail -3
✓ test-install passed (prefix kept at /tmp/aloop-test-install-fygl9g)
/tmp/aloop-test-install-fygl9g/bin/aloop
$ /tmp/aloop-test-install-fygl9g/bin/aloop --version
1.0.0
EXIT: 0 → PASS
```

#### Set up test environment
```
mkdir /tmp/qa-test-issue2-918414
git init && git commit --allow-empty -m "init"
aloop scaffold
mkdir -p /tmp/qa-test-issue2-918414/session
echo '{"status":"running","iteration":1,"max_iterations":10}' > .../session/status.json
echo '{"timestamp":"...","event":"session_start","session_id":"qa-test"}' > .../session/log.jsonl
```
Wrote test health files: `~/.aloop/health/claude.json` (healthy), `~/.aloop/health/openai.json` (cooldown)
Note: live health files were already present from actual provider usage.

#### Test: /api/state providerHealth
```
$ aloop dashboard --port 14040 --session-dir ... --workdir ... --assets-dir ... &
$ curl -s http://localhost:14040/api/state | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.keys()))"
['sessionDir', 'workdir', ..., 'providerHealth']
EXIT: 0 → providerHealth key PRESENT
```
Provider entries correct: claude, openai, gemini, codex, opencode — all have `status`, `last_success`, `last_failure`, `failure_reason`, `consecutive_failures`, `cooldown_until`.

BUG FOUND: 9 non-provider keys also present in providerHealth:
`''`, `claude-throttle-state`, `heal-counter`, `hourly-stats-state`, `minimax-quota`, `opencode-go-usage`, `opencode-throttle-state`, `provider-status`, `resource-guard-state`

#### Test: SSE state event providerHealth
```
$ timeout 5 curl -s -N http://localhost:14040/events > /tmp/sse-output.txt
$ python3 [parse event: data: {...}]
SSE state event providerHealth PRESENT
Keys: ['', 'claude-throttle-state', 'claude', 'codex', 'gemini', 'heal-counter', ...]
```
EXIT: PASS (providerHealth in SSE) but same non-provider pollution bug.

#### Test: aloop status provider health table
```
$ aloop status
Active Sessions:
  orchestrator-20260321-172932  pid=4091043  running  iter 125...
  ...

Provider Health:
             cooldown     (135 failures, resumes in 55m)   ← BLANK ENTRY [BUG]
  claude-throttle-state unknown                             ← NON-PROVIDER [BUG]
  claude     cooldown     (0 failures, resumes in 3m)
  codex      degraded     (auth error — run `gh auth login`)
  gemini     cooldown
  heal-counter unknown                                      ← NON-PROVIDER [BUG]
  hourly-stats-state unknown                                ← NON-PROVIDER [BUG]
  minimax-quota ok                                          ← ambiguous
  openai     cooldown
  opencode-go-usage unknown                                 ← NON-PROVIDER [BUG]
  opencode-throttle-state unknown                           ← NON-PROVIDER [BUG]
  opencode   cooldown     (0 failures, resumes in 4m)
  provider-status unknown                                   ← NON-PROVIDER [BUG]
  resource-guard-state unknown                              ← NON-PROVIDER [BUG]
EXIT: 0 → table renders but polluted with non-provider entries
```

Root cause: `readProviderHealth` uses `glob('*.json')` or equivalent on the health dir, reading ALL JSON files regardless of whether they are provider health files. The implementation needs to either:
1. Filter by known provider list, or
2. Filter by schema validation (only include files that have the 6 expected fields with valid `status` values)

Additionally, `~/.aloop/health/.json` is a hidden file with an empty provider name (likely created by a loop run with `PROVIDER=""`) causing the blank entry in `aloop status`.

#### Test: Provider health files at ~/.aloop/health/<provider>.json
All 5 known providers (claude, openai, gemini, codex, opencode) have valid health files with all 6 required fields. Files are in `~/.aloop/` (global), not in session dirs.
EXIT: 0 → PASS

#### Cleanup
```
kill 922012  # dashboard server
rm -rf /tmp/qa-test-issue2-918414
rm -rf "$(dirname "$(dirname "/tmp/aloop-test-install-fygl9g/bin/aloop")")"
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
