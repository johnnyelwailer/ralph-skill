# Sub-Spec: Issue #148 — Dashboard and CLI status integration for orchestrator sessions

## Objective

Make orchestrator sessions fully visible in the dashboard UI and CLI status commands.

## Scope

### Dashboard Integration
- Orchestrator sessions appear in dashboard session list with mode=orchestrator badge
- Display orchestrator-specific data:
  - Current wave / total waves
  - Issue breakdown by state (pending, in_progress, pr_open, merged, failed)
  - Active child loops with their status
  - Autonomy level indicator
  - Budget usage (for pay-per-use providers)
- Child loop sessions linked to parent orchestrator
- Real-time updates via existing polling mechanism

### CLI Status Integration
- `aloop status` shows orchestrator sessions with:
  - Session ID, PID, uptime
  - Issue progress summary (e.g., "5/12 merged, 2 in-progress, 1 blocked")
  - Active child count
  - Current wave
- `aloop status --watch` refreshes orchestrator data

### Stop Command
- `aloop stop <id>` works for orchestrator sessions (sends SIGTERM)
- Confirm prompt for stopping orchestrator (warns about active children)
- `aloop stop --all` includes orchestrator sessions

## Inputs
- `orchestrator.json` state file
- `status.json` per session
- `active.json` session registry
- Existing dashboard components
- Existing `status.ts` and `stop.ts` commands

## Outputs
- Updated dashboard views for orchestrator sessions
- Updated `status.ts` with orchestrator-aware display
- Updated `stop.ts` with orchestrator shutdown support

## Acceptance Criteria
- [ ] Dashboard displays orchestrator session with child loop status
- [ ] Issue state breakdown visible in dashboard
- [ ] `aloop status` shows orchestrator progress summary
- [ ] `aloop stop <id>` gracefully shuts down orchestrator
- [ ] Active children shown in both dashboard and CLI

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
