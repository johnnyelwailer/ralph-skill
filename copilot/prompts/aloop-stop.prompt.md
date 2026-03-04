---
name: aloop-stop
description: Stop a running Aloop loop session. Optionally cleans up the git worktree branch.
agent: agent
---

Stop a running Aloop loop session.

## Step 1: Identify Session to Stop

Resolve runtime root from current project config (`<project-root>/.aloop/config.yml` first, then `~/.aloop/projects/<hash>/config.yml`).
Read `<runtime_root>/active.json` to find active sessions.

- No active sessions → "No active Aloop sessions to stop."
- One session for the current project → use that one
- Multiple sessions → ask the user which one to stop (list session IDs with project names)

## Step 2: Stop the Process

1. Read `<runtime_root>/sessions/<session-id>/meta.json`
2. If PID is recorded:
   - Unix/macOS: `kill $PID` (SIGTERM; escalate to SIGKILL after 10s if needed)
   - Windows: `Stop-Process -Id $PID`
3. If PID unavailable or already dead, note it and continue

## Step 3: Update State

1. Update `<runtime_root>/sessions/<session-id>/status.json`: set `state` to `stopped`, update `updated_at`
2. Remove session from `<runtime_root>/active.json`
3. Append to `<runtime_root>/history.json` (keep last 100 entries):
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
"Remove the worktree branch `aloop/<session-id>`? (yes/no)"
- Yes: `git worktree remove <path> && git branch -d aloop/<session-id>`
- No: Leave it for inspection

## Step 5: Confirm

Display:
```
Aloop session stopped: <session-id>

  Project:    <project-name>
  Iterations: <count>
  Logs:       <runtime_root>/sessions/<session-id>/
  Report:     <runtime_root>/sessions/<session-id>/report.md
```
