# QA Log

## QA Session — 2026-03-27 (Issue #177 — OrchestratorAdapter threading)

### Test Environment
- Binary under test: N/A — Bash tool non-functional (see Environment Blocker below)
- Features targeted: 5
- Method: Static analysis via Read/Glob/Grep tools

### Environment Blocker

**CRITICAL:** The Bash tool is completely non-functional in this QA environment. Every shell command returns exit code 1 or 134 (SIGABRT) with no output. This prevented:
- Running `npm run build` to verify TypeScript compilation
- Running `npm test` to verify unit tests pass
- Installing the CLI binary via `npm run test-install`
- Executing any `aloop` commands

All results below are from static analysis of source files only. **Build and test verification must be done manually in a working shell environment.**

### Results

- PASS (static): OrchestratorAdapter interface defined with correct methods in `adapter.ts`
- PASS (static): GitHubAdapter implements all interface methods
- PASS (static): `adapter?` field present in all 5 required deps interfaces (TriageDeps, OrchestrateDeps, DispatchDeps, PrLifecycleDeps, ScanLoopDeps)
- PASS (static): Adapter instantiated in `orchestrateCommandWithDeps` when `filterRepo` is provided
- PASS (static): Adapter threaded through `process-requests.ts` into scanDeps, prLifecycleDeps, dispatchDeps
- NEVER TESTED: TypeScript build (Bash blocked)
- NEVER TESTED: `adapter.test.ts` unit test execution (Bash blocked)

### Bugs Filed

None — all statically-verifiable requirements are satisfied. Build/test verification blocked by environment.

### Command Transcript

All Bash commands failed. Representative sample:

```
$ cd /home/pj/.aloop/sessions/.../worktree/aloop/cli && npm run build
Exit code: 134 (no output)

$ echo hello
Exit code: 1 (no output)
```

### Static Analysis Details

**adapter.ts** (lines 1-50 verified):
- `OrchestratorAdapter` interface: all required methods present
- `GitHubAdapter` class: implements all methods
- `createAdapter` factory function: present, handles `type: 'github'`
- Imports from `github-monitor.ts`: `GhExecFn`, `GhExecResult`, `BulkIssueState`, `BulkFetchResult`, `parseRepoSlug`, `fetchBulkIssueState` — all correct

**orchestrate.ts** (verified via subagent grep):
- `TriageDeps` line 198: `adapter?: OrchestratorAdapter` ✓
- `OrchestrateDeps` line 211: `adapter?: OrchestratorAdapter` ✓
- `DispatchDeps` line 236: `adapter?: OrchestratorAdapter` ✓
- `PrLifecycleDeps` line 3447: `adapter?: OrchestratorAdapter` ✓
- `ScanLoopDeps` line 4584: `adapter?: OrchestratorAdapter` ✓
- `applyEstimateResults` inline deps type line 2413: `adapter?: OrchestratorAdapter` ✓
- Instantiation guard at ~line 1004-1011: `createAdapter({ type: 'github', repo: filterRepo }, execGhFn)` ✓

**process-requests.ts** (verified via subagent grep):
- Line 323: `const adapter = repo ? createAdapter({ type: 'github', repo }, execGh) : undefined` ✓
- scanDeps (line 936): `adapter` included ✓
- prLifecycleDeps (line 943): `adapter` passed ✓
- dispatchDeps (line 1028): `adapter` passed ✓

---

## QA Session — 2026-03-28 (Issue #177 — OrchestratorAdapter interface + regression check)

### Test Environment
- Binary under test: N/A (library-only QA — testing adapter interface and test suite)
- Commit under test: 257a6f268
- Features targeted: 5
- Method: Live execution via Bash (Bash tool functional this session)
- Deps installed: `npm install` + `npm install --prefix dashboard`

### Results

- PASS: TypeScript build (`npm run build`) — all steps complete, exit 0
- PASS: `adapter.test.ts` — 27/27 tests pass via `npx tsx --test src/lib/adapter.test.ts`
- PASS: OrchestratorAdapter interface vs spec — all 11 methods match SPEC-ADDENDUM.md lines 982-1000 exactly
- FAIL: `process-requests.ts` missing exported functions — bug filed as [qa/P1]
- FAIL: `orchestrate.ts` missing label enrichment code — bug filed as [qa/P1]

### Bugs Filed

- [qa/P1] process-requests.ts missing 7 exports deleted by d49686908: `formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir`, `syncMasterToTrunk`, `syncChildBranches`, `processCrResultFiles`, `CrResultDeps`
- [qa/P1] orchestrate.ts missing label enrichment: `wave/N` and `deriveComponentLabels` removed by d49686908; 15 additional test failures

### Command Transcript

```
$ npm run build
EXIT:0 (full build passes after npm install + npm install --prefix dashboard)

$ npx tsx --test src/lib/adapter.test.ts
# tests 27 / pass 27 / fail 0
EXIT:0

$ npx tsx --test src/commands/process-requests.test.ts
SyntaxError: The requested module './process-requests.js' does not provide an export named 'syncChildBranches'
# tests 1 / pass 0 / fail 1
EXIT:1

$ npx tsx --test src/commands/orchestrate.test.ts 2>&1 | grep "not ok" | wc -l
54   (vs 39 at merge base c805d8db1 — 15 new failures from d49686908)
```

### Pre-existing Failures (not caused by this branch)

- 39 orchestrate.test.ts failures (pre-existing at merge base c805d8db1)
- 5 dashboard.test.ts failures (pre-existing)
- 1 EtagCache (github-monitor.test.ts) failure (pre-existing)

## QA Session — 2026-03-28 (iteration 3)

### Test Environment
- Binary under test: /tmp/aloop-test-install-Ae0RER/bin/aloop (v1.0.0)
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-177-20260327-171514/worktree/aloop/cli
- Features tested: 5

### Results
- PASS: TypeScript build (npm run build) — clean exit 0
- PASS: process-requests.ts exports restored — 14/14 tests pass
- PASS: orchestrate.ts wave/N + component label fix — suite 60 subtests 1-4 pass
- PASS: OrchestratorIssueState 'review' member — TS2367 gone, tsc --noEmit clean on non-test files
- FAIL: applyDecompositionPlan dependency body injection — suite 60 subtests 5-6 fail
- FAIL: applyEstimateResults complexity/priority labels — suite 61 all 4 subtests fail

### Bugs Filed
- [qa/P1] applyDecompositionPlan missing dependency body injection (suite 60 subtests 5-6)
- [qa/P1] applyEstimateResults not applying complexity/priority labels (suite 61, TS2353 on EstimateResult)

### Regression Analysis
- Pre-regression baseline (298ac3309): 27 orchestrate failures (12 suites)
- After d49686908 adapter changes: 39 failures (+12)
- After wave/N fix (8a2efa43b): 34 failures (5 fixed, 7 still regressed vs baseline)
- Regressed suites not yet fixed: 60 (subtests 5-6), 61 (all 4 subtests)

### Command Transcript

```
# Install
ALOOP_BIN=$(npm run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"  → /tmp/aloop-test-install-Ae0RER/bin/aloop
aloop --version  → 1.0.0

# TypeScript build
npm run build  → EXIT: 0

# process-requests tests
npx tsx --test src/commands/process-requests.test.ts  → 14/14 pass, EXIT: 0

# orchestrate tests (current HEAD)
npx tsx --test src/commands/orchestrate.test.ts  → 312 pass, 34 fail

# Type check (non-test files only)
npx tsc --noEmit 2>&1 | grep -v "orchestrate.test.ts"  → (empty, no errors)

# Regression baseline check
git checkout 298ac3309 -- src/commands/orchestrate.ts
npx tsx --test src/commands/orchestrate.test.ts  → 319 pass, 27 fail (suites 60,61 not in fail list)
git checkout HEAD -- src/commands/orchestrate.ts
```
