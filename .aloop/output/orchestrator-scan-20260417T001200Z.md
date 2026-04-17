# Orchestrator Scan — 2026-04-17T00:12:52Z

## Active Children

- **issue-23** (Epic: Inner Loop Engine): loop PID 2178368 ALIVE (elapsed 20m49s), claude PID 1193084 ALIVE (elapsed 2h14m, 0.2% CPU, 250MB RSS), iter=46/review. Status last updated 2026-04-16T23:59:56Z (~13min ago). No iter-46 artifact yet — review still in progress.

## Concurrency

- cap=1, slots_used=1 (issue-23), slots_free=0
- **issue-70** (QA agent: structured coverage matrix): last session stopped 2026-04-15T17:51:08Z at iter=100 (max iterations), state=stopped, no active process. Needs redispatch when cap frees.

## PRs In Review

| Issue | PR | Title |
|-------|----|-------|
| #46 | #313 | Agents must have zero knowledge of GitHub |
| #172 | #211 | Replace mkdir locking with POSIX flock in loop.sh |
| #157 | #238 | Reduce AppView.tsx to layout shell |
| #108 | #132 | `aloop gh start` and `aloop gh stop` |
| #85 | #311 | Proof Artifact API: /api/artifacts endpoint |

## Blocked on Human

- **#173/#307**: Add concurrent_cap failure classification with 2-min hard cap

## Queue Overrides

None.

## Action

No intervention needed this cycle. issue-23 is alive and actively running iter 46/review. When it completes and cap frees, dispatch issue-70 (redispatch from last stopped state).
