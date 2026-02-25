---
name: aloop-status
description: Display status of all running Aloop loop sessions and recent history.
agent: agent
---

Display the status of all running Aloop sessions and recent history.

## Step 1: Read Active Sessions

Read `~/.aloop/active.json`. If missing or empty: "No active Aloop sessions."

## Step 2: Display Each Session

For each session in `active.json`:
1. Read `~/.aloop/sessions/<session-id>/status.json`
2. Read `~/.aloop/sessions/<session-id>/meta.json`
3. Check if the PID is still running (if available)

Display:
```
Aloop Sessions

  Session                     | Project  | Mode              | Provider | Iter | Phase | State
  my-app-20260221-143052      | my-app   | plan-build-review | claude   | 7    | build | running
  other-20260221-150000       | other    | build             | codex    | 12   | build | running

Active: 2 sessions
```

## Step 3: Highlight Current Project Session

If the cwd matches a project with an active session:
```
Current project (my-app):
  Session:      my-app-20260221-143052
  Iteration:    7 / 50
  Phase:        build
  Provider:     claude
  Stuck count:  0
  Last updated: 2 minutes ago
```

## Step 4: Show Recent History

If `~/.aloop/history.json` exists, show last 5 completed sessions:
```
Recent History:
  my-app-20260220-100000   | completed    | 23 iterations | 45m
  other-20260219-090000    | interrupted  | 8 iterations  | 12m
```

> Note: If `status.json` is stale (>10 min old with state=running), mark session as "stale" and clean it from `active.json` if PID is dead.
