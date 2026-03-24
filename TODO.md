# Issue #180: Blocker persistence tracking and diagnostics engine

## Current Phase: Implementation

### In Progress
_(none)_

### Up Next
- [x] Wire `process-requests` to call `processAgentRequests` from `lib/requests.ts` for standard agent request types (`create_issues`, `update_issue`, `close_issue`, `dispatch_child`, `merge_pr`, `post_comment`, `steer_child`) — spec §1092. Added Phase 1f in `processRequestsCommand` that calls `processAgentRequests` with `aloopDir=sessionDir` before the unrecognized file handler. Added test for `post_comment` routing. (priority: high)
- [ ] Set `stuck: true` flag in `orchestrator.json` when escalating persistent blockers — spec §1049. After writing `diagnostics.json`, also patch `orchestrator.json` to include `stuck: true`. Add unit test asserting the flag is written on escalation. (priority: high)
- [ ] Dashboard alert banner: read `diagnostics.json` and display as a red alert panel/banner when `overall_health` is `degraded` or `critical` — spec §1090, §1054, §1065. Implement in `dashboard.ts` and add a test asserting the banner appears when `diagnostics.json` is present. (priority: medium)
- [ ] Self-healing for known blockers — spec §1057–1061: (a) missing GitHub labels → call `gh label create` automatically, (b) missing `config.json` → derive from `meta.json`+`orchestrator.json`, (c) permission errors → log specific permission needed. Implement in `runOrchestratorScanPass` or a dedicated `selfHeal` helper, add unit tests. (priority: medium)

### Completed
- [x] [review] Add test: `severity: 'critical'` branch in diagnostics — pre-seed blocker with `occurrence_count: 9`, assert `severity === 'critical'` after scan pass increments to 10 — `orchestrate.test.ts`. (priority: medium) [reviewed: gates 1-10 pass]
- [x] [review] Fix TypeScript error in `lib/requests.ts:435` — cast `request.id` to `(request as any).id` in the `default:` branch where `request` is type `never` (consistent with line 432). Run `npm run type-check` to verify. (priority: high)
- [x] [review] Add `cr-analysis-result-\d+\.json` to `KNOWN_REQUEST_PATTERNS` in `process-requests.ts:933`. Add a test: unrecognized handler ignores `cr-analysis-result-5.json`. (priority: high)
- [x] [review] Align `diagnostics.json` field names to SPEC-ADDENDUM.md:1053 schema. Spec requires top-level array of blockers with per-blocker fields `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}`. Implementation wraps in `persistent_blockers` object, uses `description`→`message`, `iterations_stuck`→needs both `first_seen_iteration` + `current_iteration`, `suggested_action`→`suggested_fix`. Also missing `severity` field — derive from `occurrence_count`: `>= 10` → `'critical'`, `>= 5` (threshold) → `'warning'`. Fix: update the map in `orchestrate.ts:5853` to output spec-compliant field names, emit top-level array (drop `persistent_blockers` wrapper, keep `generated_at`/`iteration`/`overall_health` at top level), and update tests at `orchestrate.test.ts:6385`. (priority: medium)

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

### Deferred
- [ ] [spec-gap][P3] Loop pause when configured — spec §1050: "If configured, pause the loop (write `state: paused` to status.json)." Blocked until there is a config key to opt into pause behavior; implement after the `stuck` flag task is done.
- [ ] [spec-gap][P2] `dependency_cycle` blocker detection never triggers — `BlockerType` includes `'dependency_cycle'` (orchestrate.ts:96) and `BLOCKER_SUGGESTED_ACTIONS` has its entry (orchestrate.ts:5313), but `detectCurrentBlockers` (orchestrate.ts:5335) never detects it. Spec says "detect and track dependency cycles." Fix: add topological cycle detection in `detectCurrentBlockers`, or update spec to document it as a future type. Out of scope for issue #180 — file as a separate issue.

### Notes
- `process-requests.ts` handles specific known file patterns: `epic-decomposition-results.json`, `sub-decomposition-result-*.json`, `refine-result-*.json`, `review-result-*.json`. No catch-all for unknown files.
- SPEC.md:1584 says "Malformed requests are moved to `$SESSION_DIR/requests/failed/` with an error annotation."
- File scope: `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`
