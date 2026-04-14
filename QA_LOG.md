# QA Log

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
