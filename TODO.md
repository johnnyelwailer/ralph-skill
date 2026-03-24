# Issue #180: Blocker persistence tracking and diagnostics engine

## Current Phase: Implementation

### In Progress
_(none)_

### Up Next
_(none)_

### Completed
- [x] Define `BlockerSignature` type with `hash`, `type`, `issue_number`, `description`, `first_seen_iteration`, `occurrence_count` fields — `orchestrate.ts:98`
- [x] Add `blocker_signatures: BlockerSignature[]` field to `OrchestratorState` — `orchestrate.ts:126`
- [x] Implement `detectCurrentBlockers` — detects `child_stuck`, `ci_failure`, `pr_conflict`, `dispatch_failure` from state — `orchestrate.ts:5335`
- [x] Implement `updateBlockerSignatures` — increments occurrence_count for known blockers, adds new ones, removes entries for merged issues — `orchestrate.ts:5389`
- [x] Implement `computeOverallHealth` — returns `healthy`/`degraded`/`critical` based on persistent blocker count and occurrence — `orchestrate.ts:5431`
- [x] Write `diagnostics.json` after a blocker persists for N iterations (default threshold: 5) — integrated in `runOrchestratorScanPass` section 7.5 — `orchestrate.ts:5820`
- [x] Write `ALERT.md` when health is `critical` (3+ persistent or any at 10+) — `orchestrate.ts:5865`
- [x] Queue `000-critical-alert.md` prompt for self-recovery when critical — `orchestrate.ts:5904`
- [x] Unit tests: detectCurrentBlockers, updateBlockerSignatures, diagnostics.json, ALERT.md, queue/000-critical-alert.md — `orchestrate.test.ts:6157`
- [x] Implement unhandled request type logging in `process-requests.ts`: scan for unrecognized `.json` files, log error with filename + payload summary, move to `requests/failed/` with `reason: 'unsupported_type'` annotation — `process-requests.ts:287`, `process-requests.test.ts`

### Spec-Gap Analysis
- [ ] [spec-gap][P2] `dependency_cycle` blocker detection never triggers — `BlockerType` includes `'dependency_cycle'` (orchestrate.ts:96) and `BLOCKER_SUGGESTED_ACTIONS` has its entry (orchestrate.ts:5313), but `detectCurrentBlockers` (orchestrate.ts:5335) never detects it. Spec says "detect and track dependency cycles." Fix: add topological cycle detection in `detectCurrentBlockers`, or update spec to document it as a future type. This is out of scope for issue #180 (not in its AC) — file as a separate issue.

### Notes
- `process-requests.ts` handles specific known file patterns: `epic-decomposition-results.json`, `sub-decomposition-result-*.json`, `refine-result-*.json`, `review-result-*.json`. No catch-all for unknown files.
- SPEC.md:1584 says "Malformed requests are moved to `$SESSION_DIR/requests/failed/` with an error annotation."
- File scope: `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`
