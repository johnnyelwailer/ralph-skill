---
allowed-tools:
  - Bash
  - Read
  - Glob
---

<objective>
Display the status of all running Ralph sessions and recent history.
</objective>

<process>

## Step 1: Read Active Sessions

Read `~/.ralph/active.json`. If it doesn't exist or is empty, display: "No active Ralph sessions."

## Step 2: Display Each Session

For each session in `active.json`:

1. Read `~/.ralph/sessions/<session-id>/status.json` to get current state
2. Read `~/.ralph/sessions/<session-id>/meta.json` for session metadata
3. Check if the PID is still running (if available)

Display a table:

```
Ralph Sessions

  Session                      | Project     | Mode             | Provider | Iteration | Phase  | State
  my-app-20260221-143052       | my-app      | plan-build-review| claude   | 7         | build  | running
  other-proj-20260221-150000   | other-proj  | build            | codex    | 12        | build  | running

Active: 2 sessions
```

## Step 3: Show Current Project Session (if any)

If the current working directory matches a project with an active session, highlight it:

```
Current project (my-app):
  Session: my-app-20260221-143052
  Iteration: 7 / 50
  Phase: build
  Provider: claude
  Stuck count: 0
  Last updated: 2 minutes ago
```

## Step 4: Show Recent History (optional)

If `~/.ralph/history.json` exists, show last 5 completed sessions:

```
Recent History:
  my-app-20260220-100000   | completed | 23 iterations | 45m
  other-proj-20260219-090000 | interrupted | 8 iterations | 12m
```

</process>

<notes>
- If status.json is missing or stale (>10 min since updated_at with state=running), mark as "stale"
- PID checking: on Unix `kill -0 $PID`, on Windows `Get-Process -Id $PID`
- Clean up stale sessions from active.json if PID is dead
</notes>
