---
allowed-tools:
  - Bash
  - AskUserQuestion
---

<objective>
Stop a running Aloop loop session.
</objective>

<process>

## Step 1: Identify Session to Stop

Run `aloop active` (fallback: `node ~/.aloop/cli/aloop.mjs active`) to list active sessions.

- No active sessions → display "No active Aloop sessions to stop." and exit.
- One session → use it.
- Multiple sessions → ask the user which session ID to stop using AskUserQuestion.

## Step 2: Stop the Session

Run:
```
aloop stop <session-id>
```
Fallback: `node ~/.aloop/cli/aloop.mjs stop <session-id>`

Display the output as-is.

## Step 3: Clean Up Worktree (optional)

If the session used a git worktree, ask the user:
"Remove the worktree branch `aloop/<session-id>`? (yes/no)"
- Yes: `git worktree remove ~/.aloop/sessions/<session-id>/worktree && git branch -d aloop/<session-id>`
- No: Leave it for inspection.

</process>

<notes>
- The CLI handles PID lookup, SIGTERM/SIGKILL escalation, status.json update, and active.json cleanup
- Don't delete session directories — they contain logs and reports for review
</notes>
