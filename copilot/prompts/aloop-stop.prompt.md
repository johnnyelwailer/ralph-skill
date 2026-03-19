---
name: aloop-stop
description: Stop a running Aloop loop session. Optionally cleans up the git worktree branch.
agent: agent
---

Stop a running Aloop loop session.

## Step 1: Identify Session to Stop

Run `aloop active` (fallback: `node ~/.aloop/cli/aloop.mjs active`) to list active sessions.

- No active sessions → "No active Aloop sessions to stop."
- One session → use it.
- Multiple sessions → ask the user which session ID to stop (list session IDs from the output).

## Step 2: Stop the Session

Run:
```
aloop stop <session-id>
```
Fallback: `node ~/.aloop/cli/aloop.mjs stop <session-id>`

Display the output as-is.

## Step 3: Clean Up Worktree (optional)

If the session used a git worktree, ask:
"Remove the worktree branch `aloop/<session-id>`? (yes/no)"
- Yes: `git worktree remove ~/.aloop/sessions/<session-id>/worktree && git branch -d aloop/<session-id>`
- No: Leave it for inspection.

> Note: The CLI handles PID lookup, process termination, status.json update, and active.json cleanup.
