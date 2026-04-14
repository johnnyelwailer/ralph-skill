# Review Log

## Review — 2026-04-13 — commit aff01407..33cfe894

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `.github/workflows/ci.yml`, `README.md`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

### Gate 1: Spec Compliance — FAIL

The CI workflow (`ci.yml`) itself satisfies all 8 acceptance criteria from TASK_SPEC.md:
- ✅ ci.yml exists
- ✅ push + pull_request triggers on master, agent/*, aloop/*
- ✅ CLI tests via `bun run test` (correctly changed from `bun test` — bun's native runner incompatible with node:test)
- ✅ Dashboard tests via `npm test`
- ✅ Type checks for both CLI and dashboard packages
- ✅ Loop shell tests on Linux (7 suites including bats)
- ✅ PowerShell tests on Windows
- ✅ README CI badge at line 1

**However**, commit `aec9e571` made substantial changes to `aloop/cli/src/commands/orchestrate.ts` and `orchestrate.test.ts` — both explicitly listed as **Out of Scope** in TASK_SPEC.md: "Runtime/orchestrator logic changes in `aloop/cli/src/**` (Constitution Rules 2 and 6)". This violates Constitution Rules 12 (one issue, one concern) and 18 (respect file ownership).

Five behavior changes were bundled into this CI issue:
1. `validateDoR`: changed acceptance criteria detection regex
2. `validateDoR`: removed criterion 5 (dor_validated circular check)
3. `getDispatchableIssues`: added `dor_validated` guard
4. `applyEstimateResults`: expanded status progression from `Needs refinement` to 3 statuses
5. `checkPrGates`: changed 'pass' to 'pending' when CI workflows exist but no checks ran
6. `reviewPrDiff`: changed 'flag-for-human' → 'approve' when no reviewer configured (**security regression**)
7. `monitorChildSessions`: added `state='failed'`/`status='Blocked'` tracking for stopped children
8. `launchChildLoop`: added SPEC.md seeding from issue body

The `reviewPrDiff` auto-approve change (finding #6) is the most critical: it replaces the safe 'flag-for-human' default with silent auto-approval, enabling automated merges without any review when no reviewer is configured. This is a meaningful weakening of a security gate.

### Gate 2: Test Depth — Pass (conditional on Gate 1)

The orchestrate.test.ts changes that accompany the production changes are technically coherent:
- `dor_validated: false` additions in test fixtures fix a real regression (previously missing flag caused false positives)
- `statusCheckRollup` mock format aligns with actual GitHub GraphQL response shape
- `checkPrGates` test at line ~430: assertion updated to 'pass' on API error (tests gate behavior correctly, not arbitrary)

If Gate 1 findings are resolved (revert out-of-scope changes), this gate passes on the remaining CI-only changes.

### Gate 5: Integration — Conditional pass

On master: 2 pre-existing failures, 963 pass (966 total).
On this branch (worktree context): 24 failures noted, but yaml.test.ts failures appear pre-existing to this branch (yaml.ts/yaml.test.ts not modified). The aec9e571 commit fixed 27 pre-existing orchestrate test failures; yaml failures are separate and pre-date this branch.

### Gate 6: Proof — N/A

No proof manifests found. ci.yml is a config file — CI workflow proof would require triggering an actual GitHub Actions run (impossible in the current environment). Proof skip is acceptable per Gate 6 rules for config-file work.

### Gates 3, 4, 7, 8, 9

- Gate 3: N/A (CI config has no branch coverage metric)
- Gate 4: Out-of-scope changes aside, no dead code or quality issues in ci.yml itself
- Gate 7: N/A (no UI changes)
- Gate 8: No VERSIONS.md entries for GitHub Actions; `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/setup-node@v4`, `actions/upload-artifact@v4` — pinned to major versions (acceptable)
- Gate 9: README line 1 has CI badge pointing to `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg` ✅

## Review — 2026-04-13 — commit ef60dc7e..d0a300bf

**Verdict: PASS** (prior findings resolved)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `.github/workflows/ci.yml`, `README.md`

- Gate 1: orchestrate.ts production code is now identical to master — the 8 out-of-scope behavior changes (including `reviewPrDiff` security regression) have been reverted. Remaining diff is orchestrate.test.ts fixture improvements only (statusCheckRollup format, dor_validated guards in failure-path tests) — no production behavior changes.
- Gate 2: orchestrate.test.ts:2723-2813 — `statusCheckRollup` fixtures correctly match GitHub GraphQL API format; `dor_validated: false` in failure tests makes intent explicit. Thorough.
- Gate 5: QA log confirms 452 CLI tests pass, 148 dashboard tests pass; 2 deferred pre-existing script exit-code bugs (out of scope).
- Gates 3, 6, 7: N/A for CI config work.
- Gate 8: Actions pinned to major versions — acceptable.
- Gate 9: README CI badge present at line 1.

All prior [review] tasks resolved.

---

## Review — 2026-04-14 — commit 553d9449..7b0a5aa7

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/lib/session.mjs`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/src/commands/status.test.ts`, `aloop/cli/src/sanitize.test.ts`

### Gate 1: Spec Compliance — PASS (with known open TODOs)

- `76d85747`: `providerHealth` added to `DashboardState`, read via `readProviderHealth`, serialized into SSE state events via `toStateEventPayload`. Spec criterion "Dashboard SSE delivers provider health state" is satisfied at the server/SSE level.
- `53e63ad7`: `readProviderHealth` correctly skips hidden files and files lacking all canonical fields. The known partial gap (3 non-provider files with coincidental field overlap) is tracked as open `[qa/P1]` in TODO.md — not untracked.
- Frontend `AppView.tsx` not yet consuming `state.providerHealth` is tracked as an open TODO. Spec criterion technically refers to SSE delivery, not rendering.
- `262d936c`: `sanitize.test.ts` path fix — unrelated to spec, clean correction.

### Gate 2: Test Depth — PASS

- `status.test.ts:117-167` — 4 new `readProviderHealth` tests. All use `assert.deepEqual` against exact values / exact key sets. Would fail with a broken filter. Good.
- `dashboard.test.ts:198-260` — 3 new `/api/state` providerHealth tests. Tests 2 (empty), 3 (exact health values), 4 (exclusions) all use `deepEqual`/`hasOwnProperty` assertions against concrete values. Would fail with a broken implementation.

### Gate 3: Coverage — FAIL

- `isProviderHealthRecord` in `session.mjs` — tests cover files with **zero** canonical fields (heal-counter: `{count, updated_at}`, hourly-stats-state: `{hour, requests}`). No test exercises a file with exactly one coincidental canonical field (e.g. `{consecutive_failures: 0}` or `{status: "ok"}`). The `some()` check returns `true` for these, but the tests don't expose this. Filed `[review]` task in TODO.md.

### Gate 4: Code Quality — PASS

- `PROVIDER_HEALTH_FIELDS` Set constant is clean and centralized. `isProviderHealthRecord` is well-named and focused. No dead code, no duplication.

### Gate 5: Integration Sanity — CONDITIONAL PASS

- `status.test.ts`: 18/18 pass (confirmed). All 4 new filtering tests pass.
- `dashboard.test.ts`: 54/60 pass. 6 failures (tests 5,7,8,9,10,19) confirmed pre-existing by reverting issue-2 changes — not caused by this build.
- CLI tests: 1084/1118 pass. 33 pre-existing failures from zombie-loop-prevention merge (confirmed via git blame showing errors in `orchestrate.ts` originated from commit `72c41262` in zombie-loop branch, not issue-2).
- `tsc --noEmit`: type errors in `orchestrate.ts` (lines 3166, 3195) and `process-requests.ts` are pre-existing from zombie-loop merge, not introduced by issue-2 changes. Issue-2 files (`dashboard.ts`, `session.mjs`) are type-correct.

### Gate 6: Proof — ACCEPTABLE

- `iter-27/output.txt`: QA agent summary text confirming partial fix via `aloop status` CLI and `/api/state` HTTP. Not a formal screenshot/API capture but work is backend data processing, not UI. Acceptable per Gate 6 rules for non-observable-output changes.

### Gates 7, 8, 9 — N/A / PASS

- Gate 7: No UI layout changes.
- Gate 8: No dependency changes.
- Gate 9: No user-facing behavioral changes requiring doc updates.

---
