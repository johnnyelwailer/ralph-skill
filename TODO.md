# Project TODO

## Issue #180: Blocker persistence tracking and diagnostics engine

## Current Phase: Implementation — core done, helper functions missing

### In Progress

### Up Next

- [x] Implement `formatReviewCommentHistory`, `getDirectorySizeBytes`, `pruneLargeV8CacheDir` in `process-requests.ts` (critical)
  - Tests already written in `process-requests.test.ts` but implementation is missing
  - `formatReviewCommentHistory(comments)`: format PR review comment list as markdown with author/timestamp headers; skip empty bodies
  - `getDirectorySizeBytes(dir)`: recursively sum file sizes in a directory
  - `pruneLargeV8CacheDir(dir, thresholdBytes)`: delete V8 code cache dir when it exceeds threshold; return `{sizeBytes, pruned}`
  - All 6 tests in `process-requests.test.ts` must pass after implementation

- [x] Add `dispatch_failure` detection to `detectCurrentBlockers` in `orchestrate.ts` (normal)
  - Issues with `redispatch_paused: true` should be detected as `dispatch_failure` blockers
  - `BlockerType` already includes `dispatch_failure` and `BLOCKER_SUGGESTED_ACTIONS` has its suggested action; detection is the missing piece
  - Add corresponding test to `describe('detectCurrentBlockers')` block

### Deferred

- [ ] Add `dependency_cycle` detection to `detectCurrentBlockers` (low priority)
  - No reliable signal currently available in `OrchestratorIssueState` for cycle detection
  - Can be added when issue dependency tracking is implemented

### Completed

- [x] Define `BlockerSignature` type with all required fields (`hash`, `type`, `issue_number`, `description`, `first_seen_iteration`, `occurrence_count`)
- [x] Add `blocker_signatures?: BlockerSignature[]` field to `OrchestratorState`
- [x] Implement `computeBlockerHash(type, issueNumber, description)` — deterministic hash with normalized description
- [x] Implement `detectCurrentBlockers(state)` — detects `child_stuck`, `ci_failure`, `pr_conflict`
- [x] Implement `updateBlockerSignatures(existing, detected, state, iteration)` — increments counts, adds new, removes resolved
- [x] Implement `computeOverallHealth(signatures, threshold)` — returns `healthy | degraded | critical`
- [x] Add blocker tracking to `runOrchestratorScanPass` at step 7.5
- [x] Write `diagnostics.json` when any blocker reaches persistence threshold (5 iterations)
- [x] Write `ALERT.md` and queue alert prompt when health is `critical`
- [x] Log `blocker_diagnostics_written` and `blocker_alert_written` events
- [x] Auto-clear blocker signatures for `merged` issues
- [x] Implement unhandled request type logging in `requests.ts` — default case throws with type/id/payload, caller logs with `reason: 'unsupported_type'` and moves to `requests/failed/`
- [x] Add unit tests: `computeBlockerHash` (4 tests), `detectCurrentBlockers` (6 tests), `updateBlockerSignatures` (4 tests), `computeOverallHealth` (4 tests), `runOrchestratorScanPass blocker tracking` (5 integration tests)
- [x] Add test for unhandled request type in `requests.test.ts` (test 41 — all pass)
