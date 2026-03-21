# Review Log

## Review — 2026-03-21 19:10 — commit 864cb03..30cdcd3

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/cli/src/lib/requests.ts, aloop/cli/src/lib/requests.test.ts, aloop/cli/src/commands/process-requests.ts

### Gate 1: Spec Compliance — FAIL (2 findings)

1. **`processAgentRequests` is dead code.** The spec says "All request types validated before processing" and "Request IDs tracked for idempotency." `requests.ts` implements both features correctly in `processAgentRequests()`. However, the actual CLI command `process-requests.ts` has its own independent request processing logic and never imports or calls `processAgentRequests`. The entire validation/idempotency/dedup pipeline is unreachable. QA_COVERAGE.md independently confirms this with real-session evidence (68 unprocessed files, zero `processed-ids.json`).

2. **`post_comment` dedup is write-only.** The spec says: "For `post_comment`: include request.id in comment body as HTML comment for dedup detection." The code embeds the `<!-- aloop-request-id: {id} -->` marker (requests.ts:737-740) but never *reads* existing comments to detect duplicates. The marker is written but never checked — dedup detection is not implemented.

### Gate 2: Test Depth — FAIL (1 finding)

- `post_comment` test (`requests.test.ts:325-352`) asserts the marker is embedded in the outgoing body (`sentBody.includes('<!-- aloop-request-id: req-3 -->')`). This is a good test for the *embedding* half but does not test dedup *detection*. No test verifies that a post_comment with an already-seen request ID is skipped.

### Gate 3: Coverage — FAIL (1 finding)

- `handlePostComment` dedup detection branch has 0% coverage because the detection code path doesn't exist yet. Once the detection logic is added, tests must cover: no prior comments, prior comment with different ID, prior comment with matching ID → skip.

### Gate 4: Code Quality — PASS

- No dead imports, no unreachable branches, no copy-paste duplication in the changed files. `validateRequest` has clean switch/case structure. `normalizeIssueTitle` is appropriately simple.

### Gate 5: Integration Sanity — PASS

- `npm test`: 929 pass, 28 fail, 1 skipped. All 28 failures are pre-existing (identical count on stash baseline).
- `npm run type-check`: clean (no errors).
- `npm run build`: clean (no errors).

### Gate 6: Proof Verification — SKIP

- No proof manifest found under artifacts dirs. Work is purely internal (validation logic, unit tests) — skipping proof is the expected correct outcome.

### Gate 7: Runtime Layout Verification — SKIP

- No CSS/layout/UI changes.

### Gate 8: Version Compliance — PASS

- No dependency changes in scope files. VERSIONS.md checked — no version drift detected.

### Gate 9: Documentation Freshness — PASS

- No user-facing behavior changes that would require doc updates. Validation and idempotency are internal processing features.

---
