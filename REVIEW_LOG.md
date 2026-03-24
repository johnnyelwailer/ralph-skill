# Review Log

## Review — 2026-03-24 — commit 976d2d29..e7c22299

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/commands/process-requests.test.ts`, `aloop/cli/src/lib/requests.ts`

**What was reviewed:** All issue-180 changes since branch diverged from master (7e3ed34e). REVIEW_LOG.md did not exist — first review for this branch.

### Gate 5 FAIL — New TypeScript error in `lib/requests.ts:435`
The `default:` branch of the `processAgentRequests` switch was changed to include `request.id` in the error message. TypeScript infers `request` as `never` in an exhausted switch, so `request.id` fails type-check with `Property 'id' does not exist on type 'never'`. This error is new to this branch (master only had the pre-existing `process-requests.ts` `'review'` state comparison error). `npm run type-check` exits non-zero. Fix: use `(request as any).id` consistent with `(request as any).type` already on the previous line.

### Gate 4 FAIL — `cr-analysis-result-*.json` missing from `KNOWN_REQUEST_PATTERNS`
`collectUnrecognizedRequestFiles` uses `KNOWN_REQUEST_PATTERNS` to whitelist handled file types. `cr-analysis-result-\d+\.json` is handled at line 272 but absent from the whitelist. If the CR handler fails to archive such a file, it survives to the `readdir` scan and gets incorrectly moved to `requests/failed/` with `reason: 'unsupported_type'`, losing data.

### Gate 1 FAIL — `diagnostics.json` schema deviates from SPEC-ADDENDUM.md
SPEC-ADDENDUM.md specifies: `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` per blocker, as a top-level array. Implementation uses `description` (not `message`), `iterations_stuck` (not `first_seen_iteration`+`current_iteration`), `suggested_action` (not `suggested_fix`), and wraps everything in an object with a `persistent_blockers` key. The dashboard AC ("Dashboard reads this and displays a banner/panel") will need this schema to be stable and documented. Resolution: align field names to spec OR update the spec to document the actual schema.

### Passing notes
- Gate 2: `detectCurrentBlockers` tests (orchestrate.test.ts:6234) explicitly test `rebase_attempts = 2` does NOT trigger pr_conflict — a non-obvious boundary. Concrete value assertions throughout.
- Gate 2: `collectUnrecognizedRequestFiles` tests cover malformed JSON (line 66-74), 200-char truncation (line 56-64), and file-move integration (line 76-102) — all concrete assertions.
- Gate 3: All new functions have dedicated test suites covering happy path, edge cases, and error paths.
- Gate 6: N/A — purely internal logic, no observable output to capture.
- Test baseline: 26 pre-existing failures (master had 27); 41 new tests all pass. No regressions.

---

## Review — 2026-03-24 — commit a420b394..b85f8ade

**Verdict: FAIL** (1 prior finding still unresolved — tracked in TODO.md)
**Scope:** `aloop/cli/src/lib/requests.ts`, `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/commands/process-requests.test.ts`

**What was reviewed:** 3 commits since last review (`e0ee9e1e`, `c68cb2d7`, `b85f8ade`) — post-review fixes for the 2 higher-priority findings.

### Prior Finding 1 (Gate 5) — RESOLVED ✓
`lib/requests.ts:435`: `request.id` → `(request as any).id` in the `never`-typed default branch. `npm run type-check` now exits clean. Also resolved the pre-existing `'review'` state comparison TS2367 error in `process-requests.ts:415` — `'review'` is not a member of `OrchestratorIssueState` (`'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed'`), so the comparison was dead code. Both fixes are correct.

### Prior Finding 2 (Gate 4) — RESOLVED ✓
`KNOWN_REQUEST_PATTERNS` now includes `/^cr-analysis-result-\d+\.json$/` at `process-requests.ts:939`. New dedicated test `'ignores cr-analysis-result files'` (process-requests.test.ts) asserts `deepEqual(result, [])` with a concrete file — not a shallow check. The existing known-files test was also updated to include `cr-analysis-result-5.json`. Both the pattern and the test are correct.

### Prior Finding 3 (Gate 1) — STILL OPEN ✗
`diagnostics.json` schema remains non-compliant with SPEC-ADDENDUM.md:1053. `orchestrate.ts:5853–5860` still emits `description` (not `message`), `iterations_stuck` (not `first_seen_iteration` + `current_iteration`), `suggested_action` (not `suggested_fix`), wrapped in `persistent_blockers` object (not a top-level array). The `[review]` task is still present and unchecked in TODO.md — it was not picked up in this build cycle. No new task needed; existing task must be completed.

### Gate 5 (Integration Sanity) — PASS
`npm run type-check` exits cleanly. Test run: 1020 pass / 26 fail — the 26 failures are the same pre-existing failures from prior review; no regressions.

### Gate 6 (Proof) — N/A
All changes are purely internal (type cast, regex whitelist entry, dead state check removal). No observable output to capture; skipping proof is correct.

---

## Review — 2026-03-24 — commit 0008eb39..86315a80

**Verdict: PASS**
**Scope:** `aloop/cli/src/commands/orchestrate.test.ts`, `TODO.md`

**What was reviewed:** 2 commits since last review (`86315a80` build, `0c8892c7` QA) — adding test coverage for `severity=critical` branch.

### Prior Finding (Gate 3) — RESOLVED ✓
`orchestrate.ts:5859`: `severity: b.occurrence_count >= 10 ? 'critical' : 'warning'` — the `'critical'` branch was previously untested. New test at `orchestrate.test.ts:6499–6527` pre-seeds `occurrence_count: 9`, calls `runOrchestratorScanPass` (which increments to 10 via `updateBlockerSignatures`), then asserts `diagnostics.blockers[0].severity === 'critical'` with `assert.equal`. Exact-value assertion on the correct boundary (9→10). Prior finding fully resolved.

### Passing notes
- Gate 2: `assert.equal(diagnostics.blockers[0].severity, 'critical')` is a concrete assertion — not a shape check, not a truthy check. `assert.equal(diagnostics.blockers.length, 1)` verifies no spurious extra blockers. A broken severity ternary would fail this test.
- Gate 3: Both branches of `severity: b.occurrence_count >= 10 ? 'critical' : 'warning'` now covered — `'warning'` by prior test fixtures using `occurrence_count: BLOCKER_PERSISTENCE_THRESHOLD - 1` (4 → 5), `'critical'` by new test (9 → 10).
- Gate 4: Test is clean — uses existing helpers (`makeScanState`, `makeIssue`, `createMockScanDeps`), no dead code or leftover comments.
- Gate 5: QA_COVERAGE confirms 340/365 pass (25 pre-existing failures unchanged); no regressions introduced.
- Gates 6–9: N/A — test-only change with no observable output, no UI, no dependency changes, no doc updates needed.

---

## Review — 2026-03-24 — commit d05d35aa..b1c2e971

**Verdict: PASS** (final regression review)
**Scope:** `QA_COVERAGE.md`, `QA_LOG.md`

**What was reviewed:** 1 commit since last review (`b1c2e971`) — QA regression pass covering all issue-180 changes. No implementation changes since `86315a80`.

### Passing notes
- Gate 5: Verified live — `tsc --noEmit` exits clean; orchestrate.test.ts 340/365 pass (25 pre-existing unchanged); process-requests.test.ts 8/8 pass. No regressions.
- Gate 9: QA_COVERAGE.md accurately reflects actual test results; 12/14 features covered, 2 untested with valid justifications (no CLI path to trigger scan pass without live GitHub).
- Gate 10: 86% coverage (12/14) — well above 30% threshold. No P1 bugs outstanding. Coverage trend positive across all iterations.
- Gates 1–4, 6–8: N/A — QA meta files only, no implementation, tests, UI, or dependency changes.

---

## Review — 2026-03-24 — commit e748c1e8..9e3fa438

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

**What was reviewed:** 2 commits since last review (`6fd3c99f`, `9e3fa438`) — diagnostics.json schema fix.

### Prior Finding (Gate 1) — RESOLVED ✓
All 6 spec-required fields now correctly implemented in `orchestrate.ts:5854–5861`:
- `type` ✓ (was `type`)
- `message` ✓ (was `description`)
- `first_seen_iteration` ✓ (was absent)
- `current_iteration` ✓ (was `iterations_stuck`)
- `severity` ✓ (was absent — now derived: `>= 10 → 'critical'`, else `'warning'`)
- `suggested_fix` ✓ (was `suggested_action`)
- Wrapper renamed from `persistent_blockers` to `blockers` ✓

Tests at `orchestrate.test.ts:6385–6392` assert all 6 fields by name. `message` and `current_iteration` use exact-value assertions. Gate 1 prior finding fully resolved.

### Gate 3 FAIL — `severity: 'critical'` branch untested in integration context
`orchestrate.ts:5859`: `severity: b.occurrence_count >= 10 ? 'critical' : 'warning'` — new ternary with 2 branches. All `runOrchestratorScanPass` test fixtures that trigger diagnostics use `occurrence_count: BLOCKER_PERSISTENCE_THRESHOLD - 1` (= 4), which increments to 5 in `updateBlockerSignatures` — always < 10 — always produces `'warning'`. The `'critical'` branch is never triggered. (The `computeOverallHealth` unit tests at line 6331 do use `occurrence_count: 10`, but that tests a different function, not the diagnostics object construction.) Fix: add a `runOrchestratorScanPass` test with `occurrence_count: 9` so it increments to 10 and asserts `severity === 'critical'`.

### Passing notes
- Gate 1: All 6 spec-required diagnostics fields now aligned — the primary finding from the prior two reviews is fully resolved.
- Gate 2: `message` asserted with exact value (`desc`); `current_iteration` exact; `severity` and `suggested_fix` assertions catch missing/wrong-typed values.
- Gate 4: `hash` and `issue_number` correctly removed from diagnostics output (internal fields not in spec). Clean diff.
- Gate 5: `npm run type-check` clean. 1020 pass / 26 fail — pre-existing failures unchanged.
- Gate 6: N/A — purely internal field-name change; no CLI trigger path without live GitHub; no proof manifest correct.

---

## Review — 2026-03-24 — commit 9f2f3ef3..be8f3c13

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/commands/process-requests.ts`, `aloop/cli/src/commands/process-requests.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`

**What was reviewed:** 2 build commits since last review (`7b536adc`, `2cd60165`) + 1 QA commit (`be8f3c13`).

### Gate 2 FAIL — Phase 1f wiring untested at the `processRequestsCommand` level

`process-requests.test.ts:116–165` (describe "process-requests Phase 1f") calls `processAgentRequests` directly from `lib/requests.ts`, not `processRequestsCommand`. The Phase 1f block that was added to `processRequestsCommand` (lines ~305–321 of `process-requests.ts`) is not exercised by any test. `processRequestsCommand` is never called in the test suite. If the Phase 1f block was deleted or its `aloopDir` argument was wrong, the test would still pass. Fix: call `processRequestsCommand` in a test with a `post_comment` request file in `sessionDir/requests/` and assert it is moved to `processed/`.

### Passing notes

- Gate 1: `stuck: true` set correctly inside `if (persistent.length > 0)` block, after `diagnostics.json` is written — matches spec §1049. Test at `orchestrate.test.ts` verifies the persisted state file contains `stuck: true` with `assert.equal`.
- Gate 1: Phase 1f wiring uses `aloopDir: sessionDir` so `requestsDir = sessionDir/requests/` — consistent with all other phases in `processRequestsCommand`. Spec §1092 requirement is architecturally met.
- Gate 2: `stuck: true` test uses `assert.equal(persisted.stuck, true)` — exact-value, not truthy check. Would catch `stuck: false` or `stuck: undefined`.
- Gate 4: No dead code, no unused imports in either commit. Phase 1f block is clean.
- Gate 5: `tsc --noEmit` clean. 1023 pass / 26 fail — 26 are same pre-existing failures; no regressions.
- Gates 6–9: N/A — internal logic + test changes only.

---

## Review — 2026-03-24 — commit be8f3c13..4a730407

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `aloop/cli/src/commands/process-requests.test.ts`, `aloop/cli/src/commands/dashboard.ts`, `aloop/cli/src/commands/dashboard.test.ts`, `aloop/cli/dashboard/src/AppView.tsx`, `aloop/cli/dashboard/src/App.coverage.diagnostics.test.ts`, `aloop/cli/dashboard/src/App.coverage.test-utils.ts`

**What was reviewed:** 2 commits since last review (`9f3d45aa` wiring test, `4a730407` dashboard banner).

### Prior Finding (Gate 2) — RESOLVED ✓
`process-requests.test.ts` now includes `describe('process-requests Phase 1f wiring: processRequestsCommand routes agent requests')` (line 168+). The test calls `processRequestsCommand` directly — not `processAgentRequests` — with a real `post_comment` request file, asserts the file is absent from `requests/` and present in `processed/` or `failed/`. If the Phase 1f block in `processRequestsCommand` were deleted or mis-wired, the file would remain in `requests/` and the test would fail. Prior finding fully resolved.

### Gate 3 FAIL — `DiagnosticsBanner` branch coverage ~77%, below 80% threshold

`AppView.tsx:2162`: `if (!diagnostics || !health || health === 'healthy' || dismissed) return null` — the `!health` (undefined `overall_health`) path is never exercised. All test fixtures that trigger the banner provide `overall_health: 'degraded'` or `overall_health: 'critical'`.

`AppView.tsx:2181`: `{blockers.length > 0 && <ul>…</ul>}` — the false branch (banner is visible but `blockers: []` is empty) is never exercised. No test provides `overall_health: 'degraded'` or `'critical'` with an empty `blockers` array.

`AppView.tsx:2187`: `{b.suggested_fix && <span>…</span>}` — the falsy branch (blocker has no `suggested_fix`) is never exercised. All test fixtures supply a non-empty `suggested_fix` string.

Fix: add 3 tests to `App.coverage.diagnostics.test.ts` (see TODO.md task for exact specs).

### Passing notes

- Gate 1: `DiagnosticsInfo` schema in `dashboard.ts` and `AppView.tsx` matches spec §1053 (all 6 fields present). Amber for `degraded`, red for `critical` is not contradicted by spec — "red banner" in §1054 describes critical alerting context; the banner renders for both health levels as required. `diagnostics.json` is added to `watchedFiles` in `startDashboardServer` — dashboard auto-reloads on file change. ✓
- Gate 2: Banner tests assert concrete CSS classes (`toHaveClass('bg-amber-500')`, `toHaveClass('bg-red-600')`), specific text (`getByText(/Degraded/)`, `getByText(/CI failing for 10 iterations/)`), and DOM absence (`not.toBeInTheDocument()`). A wrong color or missing text would fail. ✓
- Gate 2: Wiring test in `process-requests.test.ts:168–251` — prior finding fully resolved (see above). ✓
- Gate 2: `dashboard.test.ts` asserts `overall_health === 'degraded'`, `blockers.length === 1`, `blockers[0].type === 'child_stuck'` with exact values. `null` case asserts `payload.diagnostics === null`. ✓
- Gate 4: `AlertTriangle` and `XCircle` are already imported at `AppView.tsx:8` — no new imports needed, no dead code. ✓
- Gate 5: `tsc --noEmit` exits clean. Test run: 1026/1053 pass — 26 pre-existing failures unchanged, 0 new regressions. Build succeeds. ✓
- Gates 6–9: N/A — no proof phase in regular cycle; banner is a flex element (no grid layout risk); no dependency changes; README doesn't document individual dashboard panels.

---
