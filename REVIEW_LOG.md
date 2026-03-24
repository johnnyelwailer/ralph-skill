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
