# Review Log

## Review — 2026-03-21 — commit 36039ef..8d528c9

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** orchestrate.ts, start.ts, start.test.ts, orchestrate.test.ts, process-requests.ts

- Gate 4: `orchestrate.ts:5355` — PR review filter dropped `!needs_redispatch` guard during `(as any)` cleanup. Also removed `last_reviewed_sha` de-duplication from both orchestrate.ts and process-requests.ts without typed replacement. Risk: review spam and wasted API calls on unchanged PRs.
- Gate 3: `orchestrate.ts:3213` — `parseArtifactRemovalTargets` is a ~50-line branching parser with no direct unit tests. Only covered indirectly through 2 scan-pass integration tests. Edge cases (empty input, generic "working artifact", removal intent without known files) untested.

Gates 1,2,5,6,7,8,9: PASS. Type-check clean. No test regressions (10 failures all pre-existing on master). Tests for new code assert on exact values — no shallow fakes.
