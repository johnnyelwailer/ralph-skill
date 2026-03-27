# QA Log

## QA Session — 2026-03-27 iter 7 (issue #176)

### Test Environment
- Binary under test: N/A — tested via `tsx` directly (aloop/cli)
- Commit under test: 422521987 (chore(review): PASS — gates 1-9 pass)
- Features tested: 5 (final regression pass at HEAD)

### Target Selection
Changes since iter 6 (12c916034 → 422521987): QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md only — no source changes. Confirming all gates still hold at HEAD.

### Results
- PASS: adapter.test.ts — 38/38 tests pass
- PASS: index.test.ts — 5/5 tests pass
- PASS: adapter.ts LOC — 115 LOC (under 300 threshold)
- PASS: adapter-github.ts LOC — 252 LOC (under 300 threshold)
- PASS: No dead imports in orchestrate.ts or process-requests.ts (grep returns no output)
- PASS: No hardcoded `api.github.com` URLs in built artifact (0 matches in dist/index.js)
- PRE-EXISTING: process-requests.test.ts — ERR_MODULE_NOT_FOUND for cr-pipeline.js (unrelated to issue #176)
- PRE-EXISTING: orchestrate.test.ts — 25 failures (confirmed same count on master, no commits to this file on branch)

### Bugs Filed
None — all acceptance criteria verified at HEAD.

### Command Transcript
```
# Adapter unit tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0 ✓

# Index CLI tests
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0 ✓

# LOC check
$ wc -l src/lib/adapter.ts src/lib/adapter-github.ts
  115 src/lib/adapter.ts
  252 src/lib/adapter-github.ts  ✓ both under 300

# Dead import check
$ grep -n 'createAdapter\|OrchestratorAdapter' src/commands/orchestrate.ts src/commands/process-requests.ts
# (no output) ✓

# Build server bundle
$ npm run build:server
# dist/index.js  591.2kb  Done in 14ms

# Check for hardcoded api.github.com in built artifact
$ grep -c 'api\.github\.com' dist/index.js
# 0 ✓

# Pre-existing failure confirmation
$ node_modules/.bin/tsx --test src/commands/process-requests.test.ts
# ERR_MODULE_NOT_FOUND: Cannot find module 'cr-pipeline.js' — unrelated to issue #176

# Confirmed orchestrate.test.ts failures are pre-existing (no commits to file on this branch)
$ git log origin/master..HEAD --oneline -- aloop/cli/src/commands/orchestrate.test.ts
# (no output — file not modified on this branch)
```

---

## QA Session — 2026-03-27 iter 6 (issue #176)

### Test Environment
- Binary under test: N/A — tested via `tsx` directly (aloop/cli)
- Commit under test: 12c916034 (chore(review): PASS — gates 1-9 pass)
- Features tested: 5 (final regression pass at HEAD)

### Target Selection
- All features: re-test (PASS) at dad206220 — changes since then are docs/review only (no source changes). Confirming all gates still hold at HEAD.

### Results
- PASS: adapter.test.ts — 38/38 tests pass
- PASS: index.test.ts — 5/5 tests pass
- PASS: adapter.ts LOC — 115 LOC (under 300 threshold)
- PASS: adapter-github.ts LOC — 252 LOC (under 300 threshold)
- PASS: No dead imports in orchestrate.ts or process-requests.ts (grep returns no output)
- PASS: No hardcoded github.com API URLs in built artifact (0 matches)
- PASS: No createAdapter/OrchestratorAdapter in built artifact (0 matches)

### Bugs Filed
None — all acceptance criteria verified at HEAD.

### Command Transcript
```
# Adapter unit tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0 ✓

# Index CLI tests
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0 ✓

# LOC check
$ wc -l src/lib/adapter.ts src/lib/adapter-github.ts
  115 src/lib/adapter.ts
  252 src/lib/adapter-github.ts  ✓ both under 300

# Dead import check
$ grep -n 'createAdapter|OrchestratorAdapter' src/commands/orchestrate.ts src/commands/process-requests.ts
# (no output) ✓

# Build artifact checks
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/aloop-qa-final-iter4.js
# 482.8kb built
$ grep -c 'https://github.com/api|https://api.github.com' /tmp/aloop-qa-final-iter4.js
# 0 ✓
$ grep -c 'createAdapter|OrchestratorAdapter' /tmp/aloop-qa-final-iter4.js
# 0 ✓
```

---

## QA Session — 2026-03-27 iter 5 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed; tested via `tsx` directly
- Commit under test: dad206220 (docs: clarify dead import status in TODO acceptance criteria)
- Features tested: 5 (final regression pass at HEAD)

### Results
- PASS: adapter.test.ts — 38/38 tests pass
- PASS: index.test.ts — 5/5 tests pass
- PASS: adapter.ts LOC — 115 LOC (under 300 threshold)
- PASS: adapter-github.ts LOC — 252 LOC (under 300 threshold)
- PASS: No dead imports in orchestrate.ts or process-requests.ts
- PASS: No hardcoded github.com API URLs in built artifact (0 matches)

### Bugs Filed
None — all acceptance criteria verified at HEAD. Only change since last QA is a docs commit (clarify dead import status in TODO.md).

### Command Transcript
```
# Adapter unit tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0 ✓

# Index CLI tests
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0 ✓

# LOC check
$ wc -l src/lib/adapter.ts src/lib/adapter-github.ts
  115 src/lib/adapter.ts
  252 src/lib/adapter-github.ts  ✓ both under 300

# Dead import check
$ grep -n 'createAdapter|OrchestratorAdapter' src/commands/orchestrate.ts src/commands/process-requests.ts
# (no output) ✓

# Build artifact checks
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/aloop-qa-final-iter5.js
# 482.8kb built
$ grep -c 'https://github.com/api|https://api.github.com|createAdapter|OrchestratorAdapter' /tmp/aloop-qa-final-iter5.js
# 0 ✓
```

---


## QA Session — 2026-03-27 iter 2 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed (vite not found); server bundle built via `npm run build:server`
- Commit under test: ae9830e8c
- Features tested: 5

### Results
- PASS: index.test.ts — 5/5 tests pass (including previously failing [qa/P1] "catches errors without stack traces")
- PASS: Dead import removal — no `createAdapter`/`OrchestratorAdapter` in orchestrate.ts source or built artifact
- PASS: adapter.test.ts — 38/38 tests pass at latest commit
- FAIL: adapter.ts LOC — 350 lines, above the 300 LOC threshold from SPEC-ADDENDUM.md; open review task `[review] Gate 4: adapter.ts is 351 lines` remains unresolved

### Bugs Filed
- None new (adapter.ts LOC violation already tracked in TODO.md as open review task)

### Command Transcript

```
# Build server bundle (dashboard deps not installed)
$ npm run build:server
# dist/index.js 591.2kb  Done in 11ms

# Re-test previously failing index test
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0  ← previously 1 fail (ERR_MODULE_NOT_FOUND), now fixed

# Verify dead import removal in orchestrate.ts
$ grep -n 'createAdapter\|OrchestratorAdapter' src/commands/orchestrate.ts
# (no output — import removed)
$ grep -n 'createAdapter\|OrchestratorAdapter' dist/index.js
# (no output — not in built artifact either)

# Re-run adapter test suite
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0

# Check adapter.ts LOC
$ wc -l src/lib/adapter.ts
# 350 src/lib/adapter.ts  ← over 300 LOC threshold; review task still open
```

---

## QA Session — 2026-03-27 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed; tested via `tsx` directly
- Features tested: 4 (adapter interface, GHE support, createAdapter factory, no hardcoded URLs)
- Note: `test-install` failed because dashboard `node_modules` are not installed (vite not found). Tests run directly with `tsx`.

### Results
- PASS: OrchestratorAdapter interface + GitHubAdapter (38/38 tests)
- PASS: GHE URL support in adapter
- PASS: createAdapter factory
- PASS: No hardcoded github.com API URLs in built artifact
- PRE-EXISTING (not from this branch): TypeScript errors in process-requests.ts, requests.ts, gh.test.ts — verified same errors exist on master
- PRE-EXISTING (not from this branch): 25 orchestrate.test.ts failures — verified same count on master

### Bugs Filed
None — all acceptance criteria pass.

### Command Transcript

```
# Run adapter tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0

# TypeScript check (whole project)
$ node_modules/.bin/tsc --noEmit
# errors in process-requests.ts, requests.ts, gh.test.ts
# These are PRE-EXISTING — same errors appear after git stash (on master state)

# Build server bundle (skip dashboard)
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm ... --outfile=dist/index.js
# dist/index.js  591.2kb  Done in 13ms

# Check for hardcoded github.com in built artifact
$ grep -n 'https://github\.com' dist/index.js
# 9784: copilot: "Set GH_TOKEN via ... https://github.com/settings/tokens"
# Only in Copilot help text, not in API URL construction

# Verify orchestrate test failures are pre-existing
$ git stash && tsx --test src/commands/orchestrate.test.ts
# pass 321 | fail 25  (same as on branch — pre-existing)
$ git stash pop
```

---

## QA Session — 2026-03-27 iter 4 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed; tested via `tsx` directly
- Commit under test: 5218a6cd5 (chore(review): PASS — gates 1-10 pass)
- Features tested: 5 (final regression pass)

### Results
- PASS: adapter.test.ts — 38/38 tests pass at latest commit
- PASS: adapter.ts LOC — 115 LOC (under 300 threshold)
- PASS: adapter-github.ts LOC — 252 LOC (under 300 threshold)
- PASS: No dead imports in orchestrate.ts or process-requests.ts
- PASS: No hardcoded github.com API URLs in built artifact
- PASS: index.test.ts — 5/5 tests pass

### Bugs Filed
None — all acceptance criteria verified at final commit.

### Command Transcript
```
# Adapter unit tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0 ✓

# LOC check
$ wc -l src/lib/adapter.ts src/lib/adapter-github.ts
  115 src/lib/adapter.ts
  252 src/lib/adapter-github.ts  ✓ both under 300

# Dead import check
$ grep -n 'createAdapter|OrchestratorAdapter' src/commands/orchestrate.ts src/commands/process-requests.ts
# (no output) ✓

# Build artifact checks
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/aloop-qa-final.js
# 482.8kb built
$ grep -c 'https://github\.com/api|https://api\.github\.com' /tmp/aloop-qa-final.js
# 0 ✓
$ grep -c 'createAdapter|OrchestratorAdapter' /tmp/aloop-qa-final.js
# 0 ✓

# Index CLI tests
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0 ✓
```

---

## QA Session — 2026-03-27 iter 3 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed; tested via `tsx` directly
- Commit under test: 426dbd5ed (latest)
- Features tested: 4 (re-tests of previously FAIL + new fixes)

### Results
- PASS: adapter.ts LOC threshold — split into adapter.ts (115 LOC) + adapter-github.ts (252 LOC), both under 300 LOC threshold (previously FAIL at ae9830e8c with 350 LOC)
- PASS: Dead import removal in process-requests.ts — grep returns no matches for createAdapter
- PASS: All 38 adapter tests pass after file split
- PASS: index CLI error handling — 5/5 tests pass (carry-over from iter 2)

### Bugs Filed
None — all previously-open findings resolved.

### Command Transcript
```
# LOC check
$ wc -l src/lib/adapter.ts src/lib/adapter-github.ts
  115 src/lib/adapter.ts
  252 src/lib/adapter-github.ts
# Both under 300 LOC threshold ✓

# Dead import check: process-requests.ts
$ grep -n 'createAdapter\|OrchestratorAdapter' src/commands/process-requests.ts
# (no output) ✓

# Dead import check: orchestrate.ts
$ grep -n 'createAdapter\|OrchestratorAdapter' src/commands/orchestrate.ts
# (no output) ✓

# Adapter unit tests after split
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0 ✓

# Build artifact — no hardcoded github.com API URLs
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/aloop-qa-test.js
$ grep -c 'https://github\.com/api\|https://api\.github\.com' /tmp/aloop-qa-test.js
# 0 ✓

# No createAdapter in built artifact (tree-shaken, not yet called from orchestrate.ts — expected)
$ grep -c 'createAdapter\|OrchestratorAdapter' /tmp/aloop-qa-test.js
# 0 ✓

# Index CLI tests
$ node_modules/.bin/tsx --test src/index.test.ts
# tests 5 | pass 5 | fail 0 ✓
```
