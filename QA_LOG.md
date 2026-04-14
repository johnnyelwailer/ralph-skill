# QA Log

## QA Session — 2026-04-14 (iteration 46)

### Test Environment
- Binary under test: /tmp/aloop-test-install-H31dpr/bin/aloop (version 1.0.0)
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-184129/worktree
- Branch: aloop/issue-157
- Commit: 9899c43a
- Features tested: 5

### Results
- PASS: Header.tsx LOC — 168 lines (≤200 limit met; previously FAIL at 385 LOC)
- PASS: StatusIndicators.tsx extracted — 98 LOC, new file
- PASS: QACoverageBadge.tsx extracted — 142 LOC, new file
- PASS: npm run type-check — 0 errors (dashboard TypeScript clean after refactor)
- PASS: Dashboard HTML served — HTTP 200, JS bundle 463KB, CSS 34KB load correctly
- FAIL: npm test — 1077/1111 pass, 33 fail, exit code 1 (pre-existing failures in dashboard/orchestrate/process-requests/github-monitor tests — unrelated to Header refactor; bug filed)
- FAIL: Gate 7 browser (Playwright) — same pre-existing container issue: libatk-1.0.so.0 missing; curl fallback confirms server works

### Bugs Filed
- [qa/P1] npm test exits with code 1 — 33 pre-existing failures in dashboard.test.ts (GH path hardening), orchestrate.test.ts (ReferenceError: state is not defined), process-requests.test.ts, github-monitor.test.ts; these test files unchanged since commit 6a72a5f9 but were not counted in previous QA "250/250 passing" report (prior QA may have only counted aloop.test.mjs)

### Re-tested
- Header.tsx LOC: FAIL → PASS (168 LOC after split to StatusIndicators + QACoverageBadge)
- type-check: PASS → PASS (still clean)
- npm test: PASS (250) → FAIL (33 failures, 1077/1111) — pre-existing failures now exposed

### Command Transcript

```
# Binary installed from source
$ ALOOP_BIN=/tmp/aloop-test-install-H31dpr/bin/aloop
$ $ALOOP_BIN --version
1.0.0

# LOC checks
$ wc -l aloop/cli/dashboard/src/components/layout/Header.tsx
168

$ wc -l aloop/cli/dashboard/src/components/layout/StatusIndicators.tsx
98

$ wc -l aloop/cli/dashboard/src/components/layout/QACoverageBadge.tsx
142

# Type check
$ npm run --prefix aloop/cli/dashboard type-check
> tsc --noEmit
# (no output = 0 errors)
Exit code: 0

# Full test suite
$ npm --prefix aloop/cli test
# tests 1111
# pass 1077
# fail 33
# skipped 1
Exit code: 1

Failing tests:
- dashboard.test.ts:40 — "GH request processor writes error response when aloop gh returns non-zero exit code"
  Error: gh: blocked by aloop PATH hardening
- orchestrate.test.ts — launchChildLoop, dispatchChildLoops, runOrchestratorScanPass, processQueuedPrompts
  Error: ReferenceError: state is not defined
- process-requests.test.ts — "GH request processor writes error response for unsupported request type"
- github-monitor.test.ts — EtagCache suite

# Dashboard served
$ npm run --prefix aloop/cli/dashboard build
✓ built in 4.85s

$ curl -s -w "%{http_code}" http://localhost:4042/
200 (HTML with correct JS/CSS bundle refs)

$ curl -s http://localhost:4042/assets/index-DglOSKGU.js | grep -o "qa-coverage\|elapsed\|connection"
qa-coverage, elapsed, connection (all present — StatusIndicators/QACoverageBadge compiled in)

# Gate 7 browser
$ ./node_modules/.bin/playwright screenshot --browser chromium http://localhost:4042 /tmp/qa-dashboard-1920.png
Error: libatk-1.0.so.0: cannot open shared object file
# Same container dependency issue as previous iterations
```

## QA Session — 2026-04-14 (iteration 42)

### Test Environment
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-164637/worktree
- Branch: aloop/issue-157
- Commit: 70094e0f
- Features tested: 5

### Results
- PASS: npm run type-check — exit 0, 0 errors (still clean after new test additions)
- PASS: npm test — 250/250 passing (up from 243 at iter 41; 7 new DocsPanel branch-coverage tests added)
- FAIL: DocsPanel.tsx — still 204 LOC (open bug `[qa/P1] Trim DocsPanel.tsx to ≤200 LOC` unresolved)
- FAIL: Header.tsx — still 385 LOC (tracked in TODO Up Next)
- FAIL: lib/log.ts — still 381 LOC (tracked as Gate 4 review item in TODO)
- FAIL: AppView.tsx — still 1393 LOC (main refactoring Up Next tasks not started)
- FAIL: Duplicate cooldown IIFE in DocsPanel.tsx — still present at lines 179 and 195 (tracked as Gate 4 review item)

### Bugs Filed
- None new — all known issues already tracked in TODO.md

### Re-tested
- npm test: PASS → PASS (7 additional tests added for DocsPanel branch coverage)
- type-check: PASS → PASS (still clean)
- DocsPanel.tsx LOC: still FAIL (open `[qa/P1]` bug unchanged)
- Duplicate cooldown IIFE: still FAIL (Gate 4 open)
- lib/log.ts LOC: still FAIL (Gate 4 open)

### Command Transcript

```
# Type check
$ cd aloop/cli/dashboard && ./node_modules/.bin/tsc --noEmit; echo "EXIT: $?"
EXIT: 0  — PASS

# Test suite
$ npm test -- --reporter=verbose
Test Files: 23 passed (23)
Tests:      250 passed (250)  — PASS (+7 vs iter 41)

# LOC audit
$ wc -l src/components/layout/DocsPanel.tsx src/components/layout/Header.tsx src/components/layout/Footer.tsx src/AppView.tsx src/lib/log.ts
  204 DocsPanel.tsx       FAIL (open bug)
  385 Header.tsx          FAIL (Up Next task)
   66 Footer.tsx          PASS
 1393 AppView.tsx         FAIL (main refactoring not started)
  381 lib/log.ts          FAIL (Gate 4 open)

# Duplicate IIFE check
$ grep -n "Math.max.*cooldownUntil" src/components/layout/DocsPanel.tsx
179: const remaining = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000));
195: {p.cooldownUntil && <p>... ({(() => { const r = Math.max(0, Math.floor(...)); ...})()})
→ Duplicate expression confirmed at lines 179 and 195 — FAIL (Gate 4 open)
```

---

## QA Session — 2026-04-14 (iteration 45)

### Test Environment
- Binary under test: /tmp/aloop-test-install-GqpIPs/bin/aloop (version 1.0.0)
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-164637/worktree
- Branch: aloop/issue-157
- Commit: 6a72a5f9
- Features tested: 5

### Results
- PASS: DocsPanel.tsx LOC — 199 LOC (was FAIL at 204 LOC; fixed in d9498aa3)
- PASS: DocsPanel duplicate cooldown IIFE — only 1 Math.max occurrence (was FAIL; fixed in d9498aa3)
- PASS: lib/log.ts split — log-types.ts (101), log-parse.ts (172), log-session.ts (110), log.ts (3) — all ≤200 LOC (was FAIL at 381 LOC; fixed in 69dc3bfb)
- PASS: npm run type-check — exit 0, 0 errors
- PASS: npm test — 250/250 passing
- PASS: SPEC.md — 4086 lines confirmed (restored in 6a72a5f9)
- PASS: Dashboard HTML served at port 4173 — correct HTML, JS/CSS bundles return 200
- PASS: SSE /events endpoint — returns structured state with session data
- FAIL: Header.tsx LOC — still 385 LOC (tracked in TODO Up Next)
- FAIL: AppView.tsx LOC — still 1393 LOC (main refactoring not started)
- FAIL: Gate 7 browser verification — Playwright can't launch (libatk-1.0.so.0 missing in container); curl fallback confirms server/API function; visual rendering unverified

### Bugs Filed
- None new — all known issues already tracked in TODO.md

### Re-tested (FAIL → PASS)
- DocsPanel.tsx LOC: FAIL (204) → PASS (199)
- DocsPanel duplicate cooldown IIFE: FAIL → PASS (1 occurrence)
- lib/log.ts LOC: FAIL (381) → PASS (split into 4 files all ≤200 LOC)

### Command Transcript

```
# CLI install
$ ALOOP_BIN=$(npm --prefix aloop/cli run test-install -- --keep 2>&1 | grep "^/tmp" | tail -1)
$ $ALOOP_BIN --version
1.0.0

# LOC audit
$ wc -l src/components/layout/DocsPanel.tsx src/components/layout/Header.tsx src/components/layout/Footer.tsx src/AppView.tsx
  199 DocsPanel.tsx   PASS (was 204)
  385 Header.tsx      FAIL (Up Next task)
   66 Footer.tsx      PASS
 1393 AppView.tsx     FAIL (main refactoring not started)

$ wc -l src/lib/log-types.ts src/lib/log-parse.ts src/lib/log-session.ts src/lib/log.ts
  101 log-types.ts    PASS
  172 log-parse.ts    PASS
  110 log-session.ts  PASS
    3 log.ts          PASS (re-export barrel)

# Duplicate IIFE check
$ grep -n "Math.max" src/components/layout/DocsPanel.tsx | wc -l
1  — PASS (was 2)

# Type check
$ ./node_modules/.bin/tsc --noEmit; echo "EXIT: $?"
EXIT: 0  — PASS

# Test suite
$ npm test -- --reporter=verbose
Test Files: 23 passed (23)
Tests:      250 passed (250)  — PASS

# SPEC.md line count
$ wc -l SPEC.md
4086  — PASS

# Dashboard server (started with fixture session)
$ node dist/index.js dashboard --port 4173 --session-dir dashboard/e2e/fixtures/session ...
Launching real-time progress dashboard on port 4173...

$ curl -s http://127.0.0.1:4173 | head -5
<!DOCTYPE html><html lang="en">...  EXIT: 0  — PASS (HTML served)

$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/assets/index-C01l8Uhs.js
200  — PASS (JS bundle accessible)

$ curl -s -N --max-time 3 http://127.0.0.1:4173/events | head -3
: connected
event: state
data: {"sessionDir":...,"status":{"state":"running",...},...}  — PASS (SSE works)

# Gate 7 Playwright attempt
$ npm run test:e2e
ERROR: chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file
→ 11 tests FAIL (missing system lib; cannot install without sudo; container restriction)
→ Fallback: curl-based checks confirm HTML, JS, CSS, and SSE all functional
```

---

## QA Session — 2026-04-14 (iteration 41)

### Test Environment
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-164637/worktree
- Branch: aloop/issue-157
- Commit: 3d911e69
- Features tested: 6

### Results
- PASS: npm run type-check — 0 errors (re-test of previously failing; fix confirmed)
- PASS: npm test — 243/243 passing (re-test of previously failing; fix confirmed)
- PASS: Footer.tsx extraction — 66 LOC, within limit
- PASS: Dashboard HTML served at http://localhost:37055
- PASS: SSE /events endpoint returns live session data
- FAIL: DocsPanel.tsx — still 204 LOC, open bug `[qa/P1] Trim DocsPanel.tsx to ≤200 LOC` unresolved
- FAIL: Header.tsx — 385 LOC, tracked in TODO Up Next
- FAIL: AppView.tsx — 1393 LOC (main refactoring Up Next tasks not started)

### Bugs Filed
- None new — all known issues already tracked in TODO.md

### Re-tested
- type-check: FAIL → PASS (fixed in 3d911e69)
- npm test: FAIL → PASS (fixed in 3d911e69)
- DocsPanel.tsx LOC: still FAIL (open bug unchanged)

### Command Transcript

```
# Type check
$ cd aloop/cli/dashboard && npm run type-check
# Exit 0, 0 errors — PASS

# Test suite
$ npm test -- --run
# 23 test files, 243 tests — all passed — PASS

# LOC audit
$ wc -l src/components/layout/*.tsx src/AppView.tsx
   66 Footer.tsx           PASS
  100 ResponsiveLayout.tsx PASS
  204 DocsPanel.tsx        FAIL (open bug)
  385 Header.tsx           FAIL (Up Next task)
 1393 AppView.tsx          FAIL (main refactoring not started)

# Dashboard endpoint
$ curl -s http://localhost:37055
# Returns valid HTML with React root — PASS

# SSE endpoint
$ curl -s --max-time 3 http://localhost:37055/events?sessionId=...
# Returns: event: state, data: {sessionDir, status, log, ...} — PASS
```

---

## QA Session — 2026-04-14 (iteration 1)

### Test Environment
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-164637/worktree
- Branch: aloop/issue-157
- Commit: 90c20275
- Features tested: 5 (DocsPanel extraction, Header extraction, Footer extraction, type-check, test suite)

### Results
- PASS: Footer.tsx extraction (66 LOC, within 200 LOC limit)
- FAIL: DocsPanel.tsx extraction — 204 LOC exceeds 200 LOC limit
- FAIL: Header.tsx extraction — 385 LOC exceeds 200 LOC limit (pre-existing known issue, tracked in TODO)
- FAIL: npm run type-check — 5 TypeScript errors
- FAIL: npm test — 3 of 243 tests failing

### Bugs Filed
- [qa/P1] type-check fails after DocsPanel extraction (5 TypeScript errors)
- [qa/P1] 3 tests fail after DocsPanel/Header extraction
- [qa/P1] DocsPanel.tsx exceeds 200 LOC limit (204 LOC)

### Command Transcript

```
$ wc -l aloop/cli/dashboard/src/components/layout/*.tsx
   95 DocsPanel.test.tsx
  204 DocsPanel.tsx         ← FAIL: spec limit is 200 LOC
   66 Footer.tsx            ← PASS
  385 Header.tsx            ← FAIL: spec limit is 200 LOC (known, tracked)
   92 ResponsiveLayout.test.tsx
  100 ResponsiveLayout.tsx
  942 total

$ npm run type-check
# Exit code: 2 (FAIL)
src/App.coverage.test.ts(636,65): error TS2769: No overload matches this call.
  Argument of type '{}' is not assignable to parameter of type 'Attributes & TooltipProviderProps'.
  Property 'children' is missing in type '{}' but required in type 'TooltipProviderProps'.
src/App.coverage.test.ts(636,92): error TS2769: No overload matches this call.
  Property 'sessionCost' is missing in type '{ sessions: any[]; selectedSessionId: string; ... }'
  but required in type '{ ... sessionCost: number; ... }'.
src/App.coverage.test.ts(674,43): error TS2769: TooltipProvider missing 'children'
src/App.coverage.test.ts(695,43): error TS2769: TooltipProvider missing 'children'
src/components/layout/DocsPanel.test.tsx(85,44): error TS2322: Type 'null' is not assignable to type 'string'.

$ npm test
# 1 failed test file, 3 test failures, 240 passing
# FAIL src/App.coverage.test.ts:
#   - "covers panel toggles, sidebar shortcut, and session switching"
#     TestingLibraryElementError: Found multiple elements with role "button" name /activity/i
#   - "covers older-session grouping and docs overflow branches"
#     AssertionError: expected null not to be null
#     container.querySelector('aside .mt-3 button') returned null
#   - "covers ActivityPanel and LogEntryRow exhaustive"
#     TestingLibraryElementError: Unable to find element with text "a.png"
```

## QA Session — 2026-04-14 (iteration 48)

### Test Environment
- Binary under test: /tmp/aloop-test-install-wXOZPC/bin/aloop
- Version: 1.0.0
- Commit: 009a6123
- Features tested: 5

### Results
- PASS: StatusIndicators.tsx branch coverage tests (via `cd dashboard && npx vitest run` — 263/263 pass)
- PASS: Dashboard HTML serving (HTTP 200, JS 463KB, CSS 34KB, SSE endpoint live)
- PASS: Dashboard vitest suite (25 test files, 263 tests all pass)
- FAIL: npm run type-check — 16 TypeScript errors (pre-existing; prior PASS recording was incorrect)
- FAIL: npm test — 1077/1111 pass, 33 fail (same as iter 46; no regression)

### Bugs Filed
- [qa/P1] npm run type-check fails with 16 TS errors — pre-existing errors in orchestrate.ts/process-requests.ts, incorrectly recorded as PASS in QA_COVERAGE.md

### Command Transcript

```
$ /tmp/aloop-test-install-wXOZPC/bin/aloop --version
1.0.0

$ ls -la aloop/cli/dashboard/src/components/layout/StatusIndicators.test.tsx
-rw-r--r-- 1 pj pj 2200 Apr 14 19:33 aloop/cli/dashboard/src/components/layout/StatusIndicators.test.tsx
(60 lines)

$ cd aloop/cli/dashboard && npx vitest run
 RUN  v4.1.0
 Test Files  25 passed (25)
      Tests  263 passed (263)
   Duration  49.28s
EXIT 0

$ npm run type-check  (from aloop/cli)
> tsc --noEmit
src/commands/orchestrate.ts(3166,7): error TS2304: Cannot find name 'state'.
src/commands/orchestrate.ts(3167,30): error TS2304: Cannot find name 'state'.
src/commands/orchestrate.ts(3195,32): error TS2304: Cannot find name 'state'.
src/commands/orchestrate.ts(3195,60): error TS2552: Cannot find name 'roundRobinOrder'. Did you mean 'stateRoundRobinOrder'?
src/commands/orchestrate.ts(3485,33): error TS2339: Property 'round_robin_order' does not exist on type 'OrchestratorState'.
src/commands/orchestrate.ts(3516,33): error TS2339: Property 'round_robin_order' does not exist on type 'OrchestratorState'.
src/commands/orchestrate.ts(5168,24): error TS2304: Cannot find name 'provider'.
src/commands/orchestrate.ts(5180,25): error TS2304: Cannot find name 'provider'.
src/commands/process-requests.test.ts(7,10): error TS2305: Module '"./process-requests.js"' has no exported member 'formatReviewCommentHistory'.
src/commands/process-requests.test.ts(7,38): error TS2305: Module '"./process-requests.js"' has no exported member 'getDirectorySizeBytes'.
src/commands/process-requests.test.ts(7,61): error TS2305: Module '"./process-requests.js"' has no exported member 'pruneLargeV8CacheDir'.
src/commands/process-requests.test.ts(7,83): error TS2305: Module '"./process-requests.js"' has no exported member 'syncMasterToTrunk'.
src/commands/process-requests.test.ts(7,102): error TS2305: Module '"./process-requests.js"' has no exported member 'syncChildBranches'.
src/commands/process-requests.test.ts(7,126): error TS2305: Module '"./process-requests.js"' has no exported member 'ChildBranchSyncDeps'.
src/commands/process-requests.ts(442,71): error TS2367: This comparison appears to be unintentional.
src/commands/process-requests.ts(818,25): error TS2304: Cannot find name 'sweepStaleRunningIssueStatuses'.
# 16 errors, EXIT 2
NOTE: orchestrate.ts and process-requests.ts unchanged since before commit 9899c43a;
      prior PASS entry in QA_COVERAGE.md was incorrect.

$ npm test  (from aloop/cli)
# tests 1111
# suites 89
# pass 1077
# fail 33
# EXIT 1  (same as iter 46, no regression)

$ curl -s -o /dev/null -w "%{http_code} %{size_download}" http://localhost:46375
200 719

$ curl -s -o /dev/null -w "%{http_code} %{size_download}" http://localhost:46375/assets/index-Bze4vxLR.js
200 463630

$ curl -s -o /dev/null -w "%{http_code} %{size_download}" http://localhost:46375/assets/index-BkRyKnPI.css
200 33992

$ curl -s --max-time 3 http://localhost:46375/events → live SSE state stream, EXIT 0
```
