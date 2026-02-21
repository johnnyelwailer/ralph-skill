---
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

<objective>
Stop a running Ralph loop session.
</objective>

<process>

## Step 1: Identify Session to Stop

Read `~/.ralph/active.json` to find active sessions.

If no active sessions: display "No active Ralph sessions to stop."

If one active session for the current project: use that one.

If multiple active sessions: ask the user which one to stop using AskUserQuestion:
- List session IDs with project names
- Allow selection

## Step 2: Stop the Process

1. Read `~/.ralph/sessions/<session-id>/meta.json` for session details
2. If PID is recorded in `active.json`:
   - On Unix/macOS: `kill $PID` (SIGTERM for graceful shutdown)
   - On Windows: `Stop-Process -Id $PID` or `taskkill /PID $PID`
3. If PID is not available or process is already dead, note it

## Step 3: Update State

1. Update `~/.ralph/sessions/<session-id>/status.json`:
   - Set `state` to `stopped`
   - Update `updated_at`

2. Remove the session from `~/.ralph/active.json`

3. Add to `~/.ralph/history.json` (create if doesn't exist):
   ```json
   {
     "session_id": "<id>",
     "project_name": "<name>",
     "ended_at": "<timestamp>",
     "reason": "manual_stop",
     "iterations": <count>
   }
   ```
   Keep only last 100 entries.

## Step 4: Clean Up Worktree (optional)

If the session used a git worktree, ask the user:
"Remove the worktree branch `ralph/<session-id>`?"
- Yes: `git worktree remove <path> && git branch -d ralph/<session-id>`
- No: Leave it for inspection

## Step 5: Confirm

Display:
```
Ralph session stopped: <session-id>

  Project: <project-name>
  Iterations completed: <count>
  Session directory: ~/.ralph/sessions/<session-id>/

The session report (if generated) is at:
  ~/.ralph/sessions/<session-id>/report.md
```

</process>

<notes>
- Graceful shutdown: SIGTERM allows the loop to finish the current iteration and generate a report
- If the process doesn't respond to SIGTERM after 10s, escalate to SIGKILL
- Don't delete session directories — they contain logs and reports for review
</notes>
