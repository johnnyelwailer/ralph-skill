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
