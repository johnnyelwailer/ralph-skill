# QA Log

## QA Session — 2026-03-30 (iteration 12)

### Test Environment
- Working dir: aloop/cli
- Commit under test: a33ba1099
- New commits since iter 11: ecad85f99 (process-requests GH→adapter migration), a33ba1099 (applyDecompositionPlan + runTriageMonitorCycle adapter migration)
- Features tested: 6

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 35/35 pass
- PASS: process-requests.test.ts — 23/23 pass
- PASS: tsc --noEmit (non-test files) — zero type errors
- PASS: No hardcoded github.com URLs in orchestrate.ts, process-requests.ts, adapter.ts
- FAIL: orchestrate.test.ts — 337/366 pass, 29 fail — 2 new regressions vs baseline

### Bugs Filed
- [qa/P1] runTriageMonitorCycle adapter.listComments not called (regression in a33ba1099)

### Regression Analysis
- Pre-regression baseline (iter 11, 07e21731f): 27 failures, 335 pass, 362 total
- Iter 12 (a33ba1099): 29 failures, 337 pass, 366 total
- Net: +4 tests added, +2 new passes, +2 new failures (regressions)
- New failures: suite "runTriageMonitorCycle" subtests 3-4
  - "uses adapter.listComments when adapter is present" (AssertionError: 0 !== 1, line 1615)
  - "adapter path fetches PR comments via listComments" (AssertionError: 0 !== 2, line 1652)
- Root cause: adapter.listComments not being called when adapter present in runTriageMonitorCycle

### Command Transcript
```
$ npm run build
→ EXIT: 0 (full build: dashboard vite, esbuild server, shebang, templates, bin, agents)

$ npx tsx --test src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

$ npx tsx --test src/commands/process-requests.test.ts
# tests 23 / pass 23 / fail 0

$ npx tsx --test src/commands/orchestrate.test.ts 2>&1 | tail -10
# tests 366 / suites 71 / pass 337 / fail 29

New failures vs baseline:
  Suite "runTriageMonitorCycle":
    not ok 3 - uses adapter.listComments when adapter is present
      AssertionError: 0 !== 1 (orchestrate.test.ts:1615)
    not ok 4 - adapter path fetches PR comments via listComments
      AssertionError: 0 !== 2 (orchestrate.test.ts:1652)

$ npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "\.test\.ts"
→ (no output — exit 0)

$ grep -rn "github\.com" src/commands/orchestrate.ts src/commands/process-requests.ts src/lib/adapter.ts | grep -v "//"
→ (no output — PASS)
```

---

## QA Session — 2026-03-31 (iteration 13 / final-qa)

### Test Environment
- Working dir: aloop/cli
- Commit under test: 57f728a68
- New commits since iter 12: runTriageMonitorCycle regression fix, spec-gap analysis, spec-review (2nd pass), review gates 1-9 pass
- Features tested: 5 test targets (re-verification at current HEAD)

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 36/36 pass (+1 new test vs iter 12)
- PASS: process-requests.ts full suite — 42/42 pass (+19 new tests vs iter 12)
- PASS: orchestrate.test.ts — 352/379 pass, 27 fail — pre-existing baseline restored; iter 12 regression fixed
- PASS: tsc --noEmit — zero type errors; exit 0

### Bugs Filed
(none — all previously filed bugs resolved; no new issues found)

### Regression Verification
- iter 12 regression: runTriageMonitorCycle adapter.listComments subtests 3+4 now PASS at 57f728a68
- Pre-existing baseline: 27 failures confirmed unchanged (orchestrate.test.ts); same failing suites as iter 11

### Command Transcript
```
$ npm run build
→ EXIT: 0 (full build: dashboard vite, esbuild server, shebang, templates, bin, agents)

$ npx tsx --test src/lib/adapter.test.ts
# tests 36 / pass 36 / fail 0

$ npx tsx --test src/commands/process-requests.test.ts
# tests 42 / pass 42 / fail 0

$ npx tsx --test src/commands/orchestrate.test.ts
# tests 379 / suites 73 / pass 352 / fail 27

Confirmed passing (previously failing at a33ba1099):
  ok 3 - uses adapter.listComments when adapter is present
  ok 4 - adapter path fetches PR comments via listComments

$ npx tsc --noEmit
→ tsc_exit:0 (no errors)
```

---

## QA Session — 2026-03-30 (iteration 11)

### Test Environment
- Commit under test: 07e21731f (review commit — no production code changes since iter 10)
- Features tested: 5 (regression suite)

### Results
- PASS: TypeScript build, adapter.test.ts, process-requests.test.ts, orchestrate.test.ts, tsc --noEmit

### Bugs Filed
- None

### Command Transcript

```
$ npm run build --prefix aloop/cli
→ EXIT:0

$ npx tsx --test aloop/cli/src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

$ npx tsx --test aloop/cli/src/commands/process-requests.test.ts
# tests 23 / pass 23 / fail 0

$ npx tsx --test aloop/cli/src/commands/orchestrate.test.ts
# tests 362 / pass 335 / fail 27 (identical pre-existing baseline)

$ aloop/cli/node_modules/.bin/tsc --noEmit --project aloop/cli/tsconfig.json
→ EXIT:0 (zero errors)

$ grep 'github\.com' orchestrate.ts process-requests.ts adapter.ts (non-comment)
→ zero matches
```

---

## QA Session — 2026-03-30 (iteration 10)

### Test Environment
- Working dir: aloop/cli
- Commit: 2ec73cf61
- Features tested: 4 (build, adapter unit tests, process-requests suite, orchestrate suite + 27-failure investigation)

### Results
- PASS: TypeScript build (npm run build)
- PASS: adapter.test.ts — 35/35
- PASS: process-requests.test.ts — 23/23 (incl. adapterType forwarded, defaults to "github", unknown type throws)
- PASS: tsc --noEmit — zero type errors
- PASS: No hardcoded github.com URLs in adapter paths (only comment lines)
- PASS: orchestrate.test.ts — 335/362 (27 fail — confirmed pre-existing baseline, unrelated to adapter work)

### Bugs Filed
None — all acceptance criteria confirmed passing; 27 orchestrate failures are pre-existing and not regressions from adapter work.

### Command Transcript

```
$ npm run build
→ exit 0 (dashboard + esbuild + copy steps all clean)

$ npx tsx --test src/lib/adapter.test.ts
→ # tests 35 / # pass 35 / # fail 0

$ npx tsx --test src/commands/process-requests.test.ts
→ # tests 23 / # pass 23 / # fail 0
  ok - adapterType is forwarded to createAdapter as config.type
  ok - adapterType defaults to "github" when omitted
  ok - unknown adapterType throws

$ npx tsc --noEmit --project tsconfig.json
→ exit 0 (zero type errors)

$ grep -n "github.com" src/lib/adapter.ts src/commands/orchestrate.ts src/commands/process-requests.ts
→ 2 results, both comment lines (not functional code)

$ npx tsx --test src/commands/orchestrate.test.ts
→ # tests 362 / # pass 335 / # fail 27
  (identical to iters 6-9 baseline; pre-existing failures)

27 failing suite names: orchestrateCommandWithDeps with --plan, validateDoR, launchChildLoop,
  checkPrGates, reviewPrDiff, processPrLifecycle, queueGapAnalysisForIssues,
  epic and sub-issue decomposition helpers, runOrchestratorScanPass
Investigation: failures are about spec injection, DoR checks, CI/PR status mocking — all
unrelated to OrchestratorAdapter. Adapter-specific tests within these suites pass.
```

---

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

---

## QA Session — 2026-03-30 (iteration 4)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-177-20260327-171514/worktree/aloop/cli
- Commits under test: 984c333e9 (fix: inject deps + labels), b57ba6b32 (feat: adapter instantiation in process-requests)
- Features tested: adapter field threading, adapter instantiation, regression baseline

### Results
- PASS: TypeScript build (`npm run build`) — clean exit 0
- PASS: `adapter.test.ts` — 35/35 pass
- PASS: `process-requests.test.ts` — 14/14 pass
- PASS: `orchestrate.test.ts` — 319 pass, 27 fail — matches pre-regression baseline exactly
- PASS: `tsc --noEmit` on non-test files — no errors
- PASS: Adapter field present in all 5 deps interfaces (TriageDeps, OrchestrateDeps, DispatchDeps, PrLifecycleDeps, ScanLoopDeps)
- PASS: `createAdapter` in process-requests.ts uses correct `execGh` (defined at line 316), instantiated at line 942
- PASS: Adapter threaded through scanDeps (line 957), prLifecycleDeps (line 964), dispatchDeps (line 1049)

### Bugs Filed
None — all regressions from d49686908 are fixed; back at pre-regression baseline of 27 orchestrate failures.

### Regression Analysis
- Pre-regression baseline (298ac3309): 27 orchestrate failures
- After d49686908: 39 failures (+12)
- After wave/N fix (8a2efa43b): 34 failures
- After 984c333e9 + b57ba6b32 (this session): 27 failures — BASELINE RESTORED

### Command Transcript

```
npm run build  → EXIT: 0

npx tsx --test src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

npx tsx --test src/commands/process-requests.test.ts
# tests 14 / pass 14 / fail 0

npx tsx --test src/commands/orchestrate.test.ts
# tests 346 / suites 62 / pass 319 / fail 27

npx tsc --noEmit | grep -v "test.ts"  → (empty, no errors)
```

---

## QA Session — 2026-03-30 (iteration 5)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-177-20260327-171514/worktree/aloop/cli
- Commits under test: e016e1acd (adapter-branch tests), 77bc07701 (resolveSpecQuestionIssues fix), 6ea451f74 (process-requests adapter conditional tests), 49c01a745 (triage/spec-question/PR lifecycle migration)
- Features tested: 5

### Results
- PASS: TypeScript build (`npm run build`) — clean exit 0
- PASS: `adapter.test.ts` — 35/35 pass (unchanged)
- PASS: `process-requests.test.ts` — 18/18 pass (+4 new makeAdapterForRepo tests)
- PASS: `orchestrate.test.ts` — 329/356, 27 fail (+10 new adapter-branch tests, all pass; failure count stable at pre-regression baseline)
- PASS: `tsc --noEmit` — zero errors on non-test files
- PASS: `resolveSpecQuestionIssues` adapter path — adapter: deps.adapter now passed at call site; confirmed by adapter-path test passing

### Bugs Filed
None — all new tests pass; pre-regression baseline of 27 orchestrate failures maintained.

### Regression Analysis
- Pre-regression baseline (298ac3309): 27 orchestrate failures, 319 pass, 346 total
- After iter 4 (e016e1acd): 27 failures, 329 pass, 356 total (+10 new adapter-branch tests all pass)

### Command Transcript
```
npm run build  → EXIT: 0

npx tsx --test src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

npx tsx --test src/commands/process-requests.test.ts
# tests 18 / pass 18 / fail 0
# New tests: makeAdapterForRepo (4 subtests):
#   ok 1 - (a) repo present → returns a GitHubAdapter (OrchestratorAdapter)
#   ok 2 - (a) adapter reference is the same when threaded into scanDeps, prLifecycleDeps, dispatchDeps
#   ok 3 - (b) repo null → returns undefined
#   ok 4 - (b) no repo → all three adapter slots are undefined

npx tsx --test src/commands/orchestrate.test.ts
# tests 356 / suites 68 / pass 329 / fail 27
# New adapter-branch suites (all pass):
#   applyTriageResultsToIssue adapter path (3 subtests)
#   resolveSpecQuestionIssues adapter path (1 subtest)
#   mergePr adapter path (1 subtest)
#   flagForHuman adapter path (1 subtest)
#   processPrLifecycle adapter path (1 subtest)

npx tsc --noEmit | grep -v "test.ts"  → (empty, no errors)
```

---

## QA Session — 2026-03-30 (iteration 6)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-177-20260330-080439/worktree/aloop/cli
- Commits under test: 45c344642 (migrate scanLoop/bulk-fetch execGh calls), 364b994e3 (migrate refine-result execGh call), 097fc63ba (meta.json adapter config)
- Features tested: 4 (build, refine-result adapter, meta.json adapter config, scanLoop/bulk-fetch adapter)

### Results
- PASS: TypeScript build (`npm run build`) — clean exit 0
- PASS: `adapter.test.ts` — 35/35 pass (unchanged)
- PASS: `process-requests.test.ts` — 23/23 pass (+5 new: makeAdapterForRepo subtests 5-7, updateIssueBodyViaAdapter suite 2 subtests)
- PASS: `orchestrate.test.ts` — 335/362 pass, 27 fail — 6 new tests all pass; failure count stable at pre-regression baseline
- PASS: `tsc --noEmit` — zero errors on non-test files
- PASS: refine-result execGh→adapter: `updateIssueBodyViaAdapter` (a) adapter.updateIssue called when adapter present; (b) fallback execGh called when adapter absent
- PASS: meta.json adapter config: adapterType forwarded to createAdapter; defaults to "github" when omitted; unknown adapterType throws
- PASS: scanLoop/bulk-fetch adapter: `fetchAndApplyBulkIssueState` uses adapter.fetchBulkIssueState when adapter available; skips bulk fetch when neither execGh nor adapter present

### Bugs Filed
None — all new features pass; pre-regression baseline of 27 orchestrate failures maintained.

### Regression Analysis
- Pre-regression baseline (298ac3309): 27 orchestrate failures, 319 pass, 346 total
- After iter 5 (e016e1acd): 27 failures, 329 pass, 356 total (+10 new adapter-branch tests)
- After iter 6 (097fc63ba): 27 failures, 335 pass, 362 total (+6 new tests all pass)

### New Test Coverage Since Iter 5
- process-requests: `updateIssueBodyViaAdapter` (2 subtests) — NEW
- process-requests: `makeAdapterForRepo` subtests 5-7 (adapterType forwarding) — NEW
- orchestrate: `fetchAndApplyBulkIssueState adapter path` (2 subtests) — NEW

### Command Transcript
```
npm run build  → EXIT: 0

npx tsx --test src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

npx tsx --test src/commands/process-requests.test.ts
# tests 23 / suites 7 / pass 23 / fail 0
# New: makeAdapterForRepo subtests 5-7 (adapterType), updateIssueBodyViaAdapter (2 subtests)

npx tsx --test src/commands/orchestrate.test.ts
# tests 362 / suites 71 / pass 335 / fail 27
# New: fetchAndApplyBulkIssueState adapter path (2 subtests)
#   ok 1 - uses adapter.fetchBulkIssueState instead of execGh when adapter is available
#   ok 2 - skips bulk fetch when neither execGh nor adapter is present

npx tsc --noEmit | grep -v "test.ts"  → (empty, no errors)
```

---

## QA Session — 2026-03-30 (iteration 7 — final review)

### Test Environment
- Binary under test: /tmp/aloop-test-install-Qixa7Q/bin/aloop (v1.0.0) — cleaned up after session
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-177-20260330-080439/worktree/aloop/cli
- Commits under test: 51c5eb860 (chore(review): PASS — gates 1-9 pass)
- Features tested: 5 (full suite re-run + spec acceptance criteria verification)

### Results
- PASS: TypeScript build (`npm run build`) — clean exit 0
- PASS: `adapter.test.ts` — 35/35 pass (stable)
- PASS: `process-requests.test.ts` — 23/23 pass (stable)
- PASS: `orchestrate.test.ts` — 335/362 pass, 27 fail — identical to iter 6; no regressions
- PASS: `tsc --noEmit` — zero errors on non-test files
- PASS: No hardcoded github.com URLs in orchestrate.ts, process-requests.ts, adapter.ts (non-comment lines only)
- PASS: meta.json adapter config — `meta.adapter` read at process-requests.ts:354, forwarded to `makeAdapterForRepo`, defaults to 'github'
- PASS: `updateIssueBodyViaAdapter` dual-path — adapter.updateIssue called when adapter present, fallback execGh when absent
- PASS: `fetchAndApplyBulkIssueState` adapter path — adapter.fetchBulkIssueState used at orchestrate.ts:5317-5319

### Bugs Filed
None — all acceptance criteria pass; no regressions introduced by review commit.

### Regression Analysis
- Pre-regression baseline (298ac3309): 27 orchestrate failures, 319 pass, 346 total
- Iter 6 (097fc63ba): 27 failures, 335 pass, 362 total
- Iter 7 (51c5eb860): 27 failures, 335 pass, 362 total — IDENTICAL, stable

### Command Transcript
```
ALOOP_BIN=$(npm run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"  → /tmp/aloop-test-install-Qixa7Q/bin/aloop
$ALOOP_BIN --version  → 1.0.0

npm run build  → EXIT: 0

npx tsx --test src/lib/adapter.test.ts
# tests 35 / pass 35 / fail 0

npx tsx --test src/commands/process-requests.test.ts
# tests 23 / suites 7 / pass 23 / fail 0

npx tsx --test src/commands/orchestrate.test.ts
# tests 362 / suites 71 / pass 335 / fail 27

npx tsc --noEmit | grep -v "test.ts"  → (empty, no errors)

grep -rn "github\.com" src/commands/orchestrate.ts src/commands/process-requests.ts src/lib/adapter.ts | grep -v "//.*github\.com"
→ (no output — PASS)

rm -rf /tmp/aloop-test-install-Qixa7Q
```

---

## QA Session — 2026-03-30 (Issue #177 — iter 8, final re-test)

### Test Environment
- Binary under test: /tmp/aloop-test-install-Gg2b6i/bin/aloop (version 1.0.0)
- Head commit: 62a92937e chore(review): PASS — gates 1-9 pass
- Features tested: 5 (build, adapter tests, process-requests tests, orchestrate tests, acceptance criteria)

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 35/35 pass
- PASS: process-requests.test.ts — 23/23 pass
- PASS: orchestrate.test.ts — 335/362 pass, 27 fail (same baseline as iter 7; no regressions)
- PASS: tsc --noEmit (non-test files) — zero type errors
- PASS: No hardcoded github.com URLs — only comment-line references
- PASS: meta.json adapter config wiring — meta.adapter→makeAdapterForRepo:354→createAdapter; defaults to 'github'
- PASS: updateIssueBodyViaAdapter dual-path — adapter.updateIssue:135, execGh fallback:453
- PASS: fetchAndApplyBulkIssueState adapter path — orchestrate.ts:5317-5319 stable

### Bugs Filed
None — all acceptance criteria pass. 27 orchestrate.test.ts failures are pre-existing baseline (unrelated to issue #177 scope).

### Command Transcript

```
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-Gg2b6i/bin/aloop
$ALOOP_BIN --version → 1.0.0

npm run build (in aloop/cli) → EXIT 0
npx tsx --test src/lib/adapter.test.ts → 35/35 pass, exit 0
npx tsx --test src/commands/process-requests.test.ts → 23/23 pass, exit 0
npx tsx --test src/commands/orchestrate.test.ts → 335/362 pass, 27 fail, exit 0
npx tsc --noEmit --skipLibCheck → exit 0 (no output)

grep "github.com" orchestrate.ts (non-comment) → line 4373 (comment only)
grep "github.com" process-requests.ts (non-comment) → line 824 (comment only)
grep "github.com" adapter.ts → (none)

grep "meta.adapter" process-requests.ts → line 354: makeAdapterForRepo(repo, execGh, meta.adapter)
grep "updateIssueBodyViaAdapter" process-requests.ts → lines 128, 135, 453
grep "fetchBulkIssueState" orchestrate.ts → lines 14, 5317-5319

rm -rf /tmp/aloop-test-install-Gg2b6i
```

---

## QA Session — 2026-03-30 (Issue #177 — iter 9, final regression check)

### Test Environment
- Binary under test: /tmp/aloop-test-install-uLgWX8/bin/aloop (version 1.0.0)
- Head commit: 2f59e40cf chore(review): PASS — gates 1-10 pass
- Changes since iter 8: documentation only (REVIEW_LOG.md, PR_DESCRIPTION.md, TODO.md — no code changes)
- Features tested: 4 (build, adapter tests, process-requests tests, orchestrate tests + tsc)

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 35/35 pass
- PASS: process-requests.test.ts — 23/23 pass
- PASS: orchestrate.test.ts — 335/362 pass, 27 fail (same baseline as iter 8; no regressions)
- PASS: tsc --noEmit --skipLibCheck — exit 0, zero errors

### Bugs Filed
None — no code changes since iter 8; all suites stable.

### Regression Analysis
- Iter 8 (62a92937e): 27 failures, 335 pass, 362 total
- Iter 9 (2f59e40cf): 27 failures, 335 pass, 362 total — IDENTICAL, stable

### Command Transcript
```
ALOOP_BIN=$(npm run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-uLgWX8/bin/aloop
$ALOOP_BIN --version → 1.0.0

npm run build → BUILD_EXIT: 0
npx tsx --test src/lib/adapter.test.ts → 35/35 pass, exit 0
npx tsx --test src/commands/process-requests.test.ts → 23/23 pass, exit 0
npx tsx --test src/commands/orchestrate.test.ts → 362 tests / 335 pass / 27 fail
npx tsc --noEmit --skipLibCheck → exit 0, no output

rm -rf /tmp/aloop-test-install-uLgWX8
```

---

## QA Session — 2026-03-31 (Issue #177 — iter 14, final-qa triggered by final-review)

### Test Environment
- Binary under test: /tmp/aloop-test-install-4KIU9r/bin/aloop (version 1.0.0)
- Head commit: 28a1ca40a chore(review): PASS — gates 1-9 pass
- Changes since iter 13 (fe63875c2): documentation only — README.md auth failure description fix (e7f44d93b), spec-gap second pass (210ad135f), spec-review docs trigger (cce6f2855), review gates 1-9 pass (28a1ca40a); no code changes
- Features tested: 5 (build, adapter.test.ts, process-requests.test.ts, orchestrate.test.ts, tsc)

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 36/36 pass
- PASS: process-requests.test.ts — 42/42 pass
- PASS: orchestrate.test.ts — 352/379 pass, 27 fail (same pre-existing baseline; no regressions)
- PASS: tsc --noEmit --skipLibCheck — exit 0, zero errors

### Bugs Filed
None — documentation-only changes since iter 13; all suites stable.

### Regression Analysis
- Iter 13 (57f728a68): 27 failures, 352 pass, 379 total
- Iter 14 (28a1ca40a): 27 failures, 352 pass, 379 total — IDENTICAL, stable

### Command Transcript
```
ALOOP_BIN=$(npm run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-4KIU9r/bin/aloop
$ALOOP_BIN --version → 1.0.0

npm run build → BUILD_EXIT:0
npx tsx --test src/lib/adapter.test.ts → 36/36 pass, exit 0
npx tsx --test src/commands/process-requests.test.ts → 42/42 pass, exit 0
npx tsx --test src/commands/orchestrate.test.ts → 379 tests / 352 pass / 27 fail
npx tsc --noEmit --skipLibCheck → exit 0, no output

rm -rf /tmp/aloop-test-install-4KIU9r
```

---

## QA Session — 2026-03-31 (Issue #177 — iter 15, final-qa triggered by final-review)

### Test Environment
- Binary under test: /tmp/aloop-test-install-YtHEKL/bin/aloop (version 1.0.0)
- Head commit: 8b825a886 chore(review): PASS — gates 1-9 pass
- Changes since iter 14 (419c7dd87): chore/docs only — iter 14 QA log (419c7dd87), spec-gap third pass (7457ae392), spec-review chore-log trigger (b24b8e7eb), review gates 1-9 pass (8b825a886); no code changes
- Features tested: 5 (build, adapter.test.ts, process-requests.test.ts, orchestrate.test.ts, tsc)

### Results
- PASS: TypeScript build (npm run build) — exit 0
- PASS: adapter.test.ts — 36/36 pass
- PASS: process-requests.test.ts — 42/42 pass
- PASS: orchestrate.test.ts — 352/379 pass, 27 fail (same pre-existing baseline; no regressions)
- PASS: tsc --noEmit --skipLibCheck — exit 0, zero errors

### Bugs Filed
None — chore/docs-only changes since iter 14; all suites stable.

### Regression Analysis
- Iter 14 (28a1ca40a): 27 failures, 352 pass, 379 total
- Iter 15 (8b825a886): 27 failures, 352 pass, 379 total — IDENTICAL, stable

### Command Transcript
```
ALOOP_BIN=$(npm run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-YtHEKL/bin/aloop
$ALOOP_BIN --version → 1.0.0

npm run build → BUILD_EXIT:0
npx tsx --test src/lib/adapter.test.ts → 36/36 pass, exit 0
npx tsx --test src/commands/process-requests.test.ts → 42/42 pass, exit 0
npx tsx --test src/commands/orchestrate.test.ts → 379 tests / 352 pass / 27 fail
npx tsc --noEmit --skipLibCheck → exit 0, no output

rm -rf /tmp/aloop-test-install-YtHEKL
```
