---
name: ralph-stop
description: Stop a running Ralph loop session. Optionally cleans up the git worktree branch.
agent: agent
---

Stop a running Ralph loop session.

## Step 1: Identify Session to Stop

Read `~/.ralph/active.json` to find active sessions.

- No active sessions → "No active Ralph sessions to stop."
- One session for the current project → use that one
- Multiple sessions → ask the user which one to stop (list session IDs with project names)

## Step 2: Stop the Process

1. Read `~/.ralph/sessions/<session-id>/meta.json`
2. If PID is recorded:
   - Unix/macOS: `kill $PID` (SIGTERM; escalate to SIGKILL after 10s if needed)
   - Windows: `Stop-Process -Id $PID`
3. If PID unavailable or already dead, note it and continue

## Step 3: Update State

1. Update `~/.ralph/sessions/<session-id>/status.json`: set `state` to `stopped`, update `updated_at`
2. Remove session from `~/.ralph/active.json`
3. Append to `~/.ralph/history.json` (keep last 100 entries):
   ```json
   {
     "session_id": "<id>",
     "project_name": "<name>",
     "ended_at": "<timestamp>",
     "reason": "manual_stop",
     "iterations": <count>
   }
   ```

## Step 4: Clean Up Worktree (optional)

If the session used a git worktree, ask:
"Remove the worktree branch `ralph/<session-id>`? (yes/no)"
- Yes: `git worktree remove <path> && git branch -d ralph/<session-id>`
- No: Leave it for inspection

## Step 5: Confirm

Display:
```
Ralph session stopped: <session-id>

  Project:    <project-name>
  Iterations: <count>
  Logs:       ~/.ralph/sessions/<session-id>/
  Report:     ~/.ralph/sessions/<session-id>/report.md
```
