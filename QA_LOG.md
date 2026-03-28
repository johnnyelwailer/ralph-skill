# QA Log

## QA Session — 2026-03-28 (iteration 52)

### Test Environment
- Binary under test: /tmp/aloop-test-install-QhoQOK/bin/aloop (version 1.0.0)
- Commit: 67d41e26d
- Features tested: 5

### Results
- PASS: SliderView.tsx branch coverage ≥90% (re-test, was FAIL)
- PASS: LogEntryRow.tsx branch coverage ≥90% (re-test, was FAIL)
- PASS: All dashboard tests pass (368/368, 34 test files)
- PASS: TypeScript type-check (tsc --noEmit, no errors)
- FAIL: ResponsiveLayout.tsx branch coverage ≥90% (75%, lines 45,92 uncovered)

### Bugs Filed
- [qa/P1] ResponsiveLayout.tsx branch coverage 75% (lines 45, 92): below 90% spec requirement

### Command Transcript

```
# Install from source
$ npm --prefix aloop/cli run --silent test-install -- --keep
Binary: /tmp/aloop-test-install-QhoQOK/bin/aloop

$ /tmp/aloop-test-install-QhoQOK/bin/aloop --version
1.0.0

# Run dashboard tests with coverage
$ cd aloop/cli/dashboard && npm run test -- --reporter=verbose --coverage
...
 Test Files  34 passed (34)
      Tests  368 passed (368)
   Duration  5.07s

Coverage highlights:
  SliderView.tsx        | 96.55 | 90.00 | 100 | 100 | 19
  LogEntryRow.tsx       | 100   | 93.97 | 100 | 100 | 66,71,114,122
  ResponsiveLayout.tsx  | 92.10 | 75.00 | 100 | 94.11 | 45,92  ← FAIL

# TypeScript check
$ npx tsc --noEmit
(no output)
Exit code: 0

# Check AppView.tsx LOC (ongoing spec-gap)
$ wc -l aloop/cli/dashboard/src/AppView.tsx
1299 (spec requires <100, already tracked as spec-gap/P1)

# aloop status
$ aloop status
Active Sessions:
  orchestrator-20260321-172932-issue-183-20260327-180626  pid=989860  running  iter 52, qa
Provider Health:
  claude     healthy
  codex      healthy
  opencode   healthy
Exit code: 0
```

---

## QA Session — 2026-03-28 (iteration 23)

### Test Environment
- Binary under test: /tmp/aloop-test-install-3Y8l4P/bin/aloop (version 1.0.0)
- Commit: 274636ea8
- Features tested: 4

### Results
- PASS: LogEntryExpandedDetails branch coverage ≥90% (93.47%, was FAIL at 86.95%)
- PASS: vitest coverage config includes new components (all extracted components now in coverage)
- PASS: All dashboard tests (350/350)
- PASS: TypeScript type-check (tsc --noEmit, exit 0)
- FAIL: SliderView.tsx branch coverage 70% — new bug filed [qa/P1]
- FAIL: LogEntryRow.tsx branch coverage 89.15% — new bug filed [qa/P1]

### Bugs Filed
- [qa/P1] SliderView.tsx branch coverage 70% (lines 19-26,52 uncovered)
- [qa/P1] LogEntryRow.tsx branch coverage 89.15% (lines 177-183 uncovered)

### Command Transcript

```
# Install CLI from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Binary: /tmp/aloop-test-install-3Y8l4P/bin/aloop
# Version: 1.0.0

# Test 1: All dashboard tests
cd aloop/cli/dashboard && npm run test -- --run
# → 32 test files passed, 350/350 tests (exit 0)

# Test 2: LogEntryExpandedDetails branch coverage (re-test of previous FAIL)
npx vitest run --coverage --coverage.include='**/LogEntryExpandedDetails.tsx'
# → LogEntryExpandedDetails.tsx: 93.47% branch coverage (PASS, was 86.95%)

# Test 3: Full coverage (vitest config fix re-test + new component coverage check)
npx vitest run --coverage
# → EXIT CODE: 0
# → All extracted components appear in report
# → SliderView.tsx: 70% branch (FAIL — lines 19-26,52)
# → LogEntryRow.tsx: 89.15% branch (FAIL — lines 177-183)
# → All other new components ≥90% branch

# Test 4: TypeScript type-check
npx tsc --noEmit
# → EXIT CODE: 0 (no errors)
```

## QA Session — 2026-03-27 (current iteration)

### Test Environment
- Working directory: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260327-180626/worktree
- Dashboard dir: aloop/cli/dashboard
- Binary under test: vitest (npm run test), tsc (type-check)
- Features tested: 5
- Commit at test time: a681c80

### Results
- PASS: All 342 dashboard tests (npm run test)
- PASS: isCurrentIteration prop removed (grep confirms zero occurrences)
- PASS: TypeScript type-check (tsc --noEmit, no errors)
- FAIL: LogEntryExpandedDetails branch coverage 84.78% (below ≥90%)
- FAIL: ImageLightbox branch coverage 50% (line 5 uncovered branch)
- FAIL: vitest.config.ts coverage.include missing newly extracted components

### Bugs Filed
- [qa/P1] ImageLightbox.tsx branch coverage 50% (line 5) — below ≥90% requirement
- [qa/P2] vitest.config.ts coverage.include missing new components — coverage enforcement gap

### Note on In-Progress Task
LogEntryExpandedDetails branch coverage (84.78%) is already tracked as in-progress review Gate 3 in TODO.md. Not re-filed.

---

## QA Session — 2026-03-28 (iteration 22)

### Test Environment
- Working directory: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260327-180626/worktree
- Dashboard dir: aloop/cli/dashboard
- Binary under test: /tmp/aloop-test-install-UQZx1Z/bin/aloop v1.0.0 (test-install verified); vitest (coverage); tsc (type-check)
- Features tested: 5
- Commit at test time: 780e0a4

### Results
- PASS: All 347 dashboard tests (npm run test) — up from 342 last session
- PASS: ImageLightbox branch coverage 100% (was 50%, non-Escape key test added in commit 780e0a4)
- PASS: TypeScript type-check (tsc --noEmit, no errors)
- PASS: aloop status (shows active sessions and provider health, exit 0)
- FAIL: LogEntryExpandedDetails branch coverage 86.95% (was 84.78% last session, improved but still below ≥90% spec requirement, line 76 uncovered)
- FAIL (known): vitest.config.ts coverage.include missing new components — still open [qa/P2]

### Bugs Filed
- [qa/P1] LogEntryExpandedDetails.tsx branch coverage 86.95% after Gate 3 fix — line 76 still uncovered, below ≥90% spec requirement

### Re-test: Previously Filed Bugs
- [qa/P1] ImageLightbox branch coverage: **FIXED** — now 100% (was 50%)
- [qa/P2] vitest.config.ts coverage.include: **still open** — no change

### Command Transcript

```
# Install from source (validates full install path)
$ npm run --prefix aloop/cli test-install -- --keep 2>&1 | tail -1
/tmp/aloop-test-install-UQZx1Z/bin/aloop
$ /tmp/aloop-test-install-UQZx1Z/bin/aloop --version
1.0.0
Exit: 0

# Test 1: Run full test suite (regression)
$ cd aloop/cli/dashboard && npm run test
Test Files: 32 passed (32)
Tests: 347 passed (347)
Exit: 0

# Test 2: ImageLightbox branch coverage (re-test of previously FAIL item)
$ npx vitest run --coverage --coverage.include='**/ImageLightbox.tsx'
File               | % Stmts | % Branch | % Funcs | % Lines
ImageLightbox.tsx  |     100 |      100 |     100 |     100
Exit: 0 — PASS (fixed!)

# Test 3: LogEntryExpandedDetails branch coverage
$ npx vitest run --coverage --coverage.include='**/LogEntryExpandedDetails.tsx'
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
LogEntryExpanded... |   88.88 |    86.95 |   83.33 |    87.5 | 76
Exit: 0 — FAIL (86.95% < 90% spec requirement, line 76 still uncovered)
All 10 tests pass including the 4 from Gate 3, but line 76 branch still not covered.

# Test 4: TypeScript type-check
$ cd aloop/cli/dashboard && npx tsc --noEmit
(no output — clean)
Exit: 0

# Test 5: aloop status (isolated temp dir)
$ mkdir /tmp/qa-test-$$ && cd /tmp/qa-test-$$ && $ALOOP_BIN status
Active Sessions:
  orchestrator-20260321-172932  pid=2986155  running  iter 3137
  orchestrator-20260321-172932-issue-183-20260327-180626  pid=989860  running  iter 22, qa
  [2 other sessions]
Provider Health:
  claude     healthy
  opencode   healthy
  codex      healthy
  copilot    healthy
  gemini     cooldown
Exit: 0

# Cleanup
$ rm -rf /tmp/aloop-test-install-UQZx1Z
```

---

### Command Transcript

```
# Test 1: Run full test suite
$ cd aloop/cli/dashboard && npm run test
> vitest run
Test Files: 32 passed (32)
Tests: 342 passed (342)
Exit code: 0

# Test 2: Verify isCurrentIteration removal
$ grep -r "isCurrentIteration" aloop/cli/dashboard/src/
(no output — zero occurrences confirmed)
Exit code: 0

# Test 3: TypeScript type-check
$ cd aloop/cli/dashboard && npx tsc --noEmit
(no output — clean)
Exit code: 0

# Test 4: LogEntryExpandedDetails branch coverage
$ npx vitest run --coverage --coverage.include='**/LogEntryExpandedDetails*'
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
LogEntryExpanded... |   88.88 |    84.78 |   83.33 |    87.5 | 76
Exit code: 0

# Test 5: ImageLightbox branch coverage
$ npx vitest run --coverage --coverage.include='**/ImageLightbox.tsx'
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
ImageLightbox.tsx   |     100 |       50 |     100 |     100 | 5
Exit code: 0

# Test 6: Check vitest.config.ts coverage include list
$ cat aloop/cli/dashboard/vitest.config.ts
coverage.include only has: App.tsx, AppView.tsx, useIsTouchDevice.ts, tooltip.tsx, hover-card.tsx
— ImageLightbox.tsx, LogEntryExpandedDetails.tsx, and all other new components are NOT included
```
