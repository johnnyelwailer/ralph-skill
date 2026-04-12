# Review Log

## Review — 2026-04-12 08:35 — branch aloop/issue-176 vs trunk

**Verdict: FAIL** (6 prior findings unresolved — 0 new changes to review)
**Scope:** aloop/cli/src/lib/adapter.ts, aloop/cli/src/lib/adapter.test.ts

No code changes since last review (commit `5feb667b`). `adapter.ts` and `adapter.test.ts` have zero diffs. All 6 `[review]` tasks from prior review remain unchecked in TODO.md. No build iteration addressed any findings.

**Prior findings still open (all unchanged):**
- Gate 1: `adapter.ts:60-85` — interface still deviates from TASK_SPEC.md (positional vs opts params, missing methods, missing metadata)
- Gate 1: `adapter.ts:288` — factory still takes AdapterConfig param instead of reading meta.json
- Gate 1: `adapter.ts:121` — closeIssue still missing `reason` param per spec
- Gate 2: `adapter.test.ts` — still missing tests for updateIssue state branching, empty comments, error paths
- Gate 4: `adapter.ts` — still 293 LOC (Constitution target < 150)
- Gate 5: adapter module still not imported by any production code (dead code)
- Gate 9: no documentation updated for OrchestratorAdapter interface

---

## Review — 2026-04-11 — branch aloop/issue-176 vs trunk

**Verdict: FAIL** (5 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/cli/src/lib/adapter.ts, aloop/cli/src/lib/adapter.test.ts, .gitignore

---

### Gate 1: Spec Compliance — FAIL

The `OrchestratorAdapter` interface deviates from TASK_SPEC.md in multiple ways:

1. **Method signature mismatches:**
   - Spec: `createIssue(title: string, body: string, labels: string[])` → Impl: `createIssue(opts: { title, body, labels? })` — spec has positional params, impl uses opts object
   - Spec: `closeIssue(number: number, reason: string)` — Impl: `closeIssue(issueNumber: number)` — missing `reason` param
   - Spec: `listIssues(opts)` → Impl: `queryIssues(opts)` — renamed method
   - Spec: `mergePr(number, strategy)` — Impl: `mergePr(prNumber, opts?)` — different signature (opts object with method/deleteBranch vs strategy string)
   - Spec: `getPrStatus` returns `{ state, mergeable, checks }` — Impl returns `{ mergeable, mergeStateStatus }` — missing `state` and `checks` (moved to separate `getPrChecks`)

2. **Missing methods from spec:**
   - `getIssueComments(number, since?)` — not implemented
   - `getPrComments(number, since?)` — not implemented
   - `getPrReviews(number)` — not implemented
   - `syncProjectStatus?(issueNumber, status)` — not implemented (spec says optional)

3. **Extra methods not in spec:**
   - `updateIssue` — has different signature than spec (spec has `updateIssue(number, opts: { body?, state?, labelsAdd?, labelsRemove? })`)
   - `getIssue` — not in spec
   - `getPrChecks` — not in spec (extracted from spec's `getPrStatus`)
   - `addLabels`, `removeLabels` — spec only has `ensureLabelsExist(labels)`
   - `ensureLabelExists` — spec has `ensureLabelsExist` (plural, batch)
   - `fetchBulkIssueState` — not in spec
   - `postComment` — spec only has it for issues, impl uses it for both issues and PRs

4. **Missing metadata from spec:**
   - `readonly repoSlug: string` — not on interface
   - `readonly baseUrl: string` — not on interface; no enterprise URL derivation (`gh api /meta` or `GH_HOST`)

5. **Factory mismatch:**
   - Spec: `createAdapter` reads adapter type from `meta.json`
   - Impl: takes `AdapterConfig` as parameter directly — no meta.json integration

### Gate 2: Test Depth — PARTIAL PASS (with concerns)

Tests assert exact values in many places (issue number 42, title 'Test Issue', etc.) which is good. However:

- `updateIssue` — no test (critical: has state-to-close/reopen branching logic)
- `listComments` — no test for empty comments array
- Error paths untested: `queryIssues` with gh failure, `getPrStatus` with malformed JSON
- `addLabels`/`removeLabels` — tested for argument count but not verifying the actual `gh issue edit` command shape
- No edge cases: empty labels array, issue number 0, special characters in comment body

### Gate 3: Coverage — FAIL (cannot verify)

Tests could not be executed in this environment (tsx timeout). Coverage cannot be verified. **Assumed below threshold until proven otherwise.**

### Gate 4: Code Quality — FAIL

- `adapter.ts` is 293 lines — exceeds Constitution rule 7 (< 150 LOC per file). Should be split.
- `addLabels` and `removeLabels` issue individual `gh` calls per label — should batch with comma-separated labels
- Module is not imported by any production code (`grep` found only test file import) — dead code until integrated

### Gate 5: Integration Sanity — FAIL

- The adapter module is not imported or used by `orchestrate.ts`, `process-requests.ts`, or any other production code
- Tests could not be verified to pass

### Gate 6: Proof Verification — N/A

No proof manifest exists. No UI or observable behavior to prove. Gate does not apply (pure logic module).

### Gate 7: Runtime Layout — N/A

No UI changes.

### Gate 8: Version Compliance — PASS

Adapter has zero external dependencies. Uses only `node:test` and `node:assert/strict`. No version concerns.

### Gate 9: Documentation Freshness — FAIL

No documentation updated to describe the new `OrchestratorAdapter` interface, its usage, or how to create custom adapters. README.md is unchanged.
