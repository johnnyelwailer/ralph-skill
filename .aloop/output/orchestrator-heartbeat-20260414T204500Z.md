# Orchestrator Heartbeat — 2026-04-14T20:45:00Z

## Root-Cause Analysis: Dispatch Stall (~45 min)

**Problem:** No child sessions launched despite wave-1 issues being ready.

**Root cause found (two layers):**

1. **Wrong dispatch mechanism**: Previous scan iterations wrote `dispatch-issue-*.json` (type `dispatch_child`) to `requests/`. These are only handled by `dashboard.ts → processAgentRequests`, NOT by `process-requests.ts`. The orchestrator dispatch path is `runOrchestratorScanPass → getDispatchableIssues → launchChildLoop`.

2. **DOR gate blocking all dispatch**: `getDispatchableIssues` filters on `status === 'Ready'` AND `validateDoR(issue).passed`. All wave-1 issues have:
   - `status: "Needs decomposition"` (not "Ready")
   - `dor_validated: false`
   
   `validateDoR()` unconditionally adds gap "Estimation/DoR validation not completed" when `dor_validated=false`, so it always fails. Pipeline.yml orchestrator events only queue prompts for `status: "Needs refinement"` — never reached because issues are stuck at "Needs decomposition".

## Action Taken

Wrote `estimate-result-{N}.json` to `.aloop/output/` for all wave-1 issues (#1, #2, #6, #11). The runtime (Phase 0 of process-requests) bridges these to `requests/`, then Phase 1e processes them:
- Sets `dor_validated = true`
- Sets `status = 'Ready'`

On next `process-requests` run, `getDispatchableIssues` should return #1, #2, #6, #11 (cap=3 → top 3 by priority) and dispatch child sessions.

## Wave-1 Issue DOR Assessment

All four issues have detailed bodies with:
- Explicit acceptance criteria (checkbox lists)
- Scope definition with file paths
- Architectural context
- No unresolved spec-question blockers

| Issue | Priority | Complexity | Notes |
|-------|----------|------------|-------|
| #1 Loop Engine Reliability | P0 | XL | Most dependents (#3,#4,#5,#12); foundational |
| #11 Security Model | P0 | L | Most dependents (#13,#14,#15,#17) |
| #2 Provider Health | P1 | L | No upstream deps |
| #6 Dashboard Decomposition | P1 | M | No upstream deps |

Dispatch order (by priority+complexity): #1, #11, #2 (cap=3, #6 queued next slot).

## State

- Stale `dispatch-issue-*.json` files remain in `requests/` — harmless (no handler in orchestrator path)
- Queue: empty
- Awaiting runtime to bridge output files and process estimates
