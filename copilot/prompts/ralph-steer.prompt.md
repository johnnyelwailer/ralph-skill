---
name: aloop-steer
description: Send a live steering instruction to a running Aloop session. Queues STEERING.md for the next iteration boundary.
agent: agent
---

Send a live steering instruction to a running Aloop session.

## Step 1: Find active sessions

Read `~/.aloop/active.json`.

- If missing or empty: "No active Aloop sessions. Start one with `/aloop-start` first."
- If exactly one session exists, select it.
- If multiple sessions exist, ask the user which session to steer (show session id + project).

## Step 2: Read current loop state

Read for the selected session:
- `~/.aloop/sessions/<session-id>/status.json`
- `~/.aloop/sessions/<session-id>/meta.json`

Display:
```
Steering session: <session-id>
  Project:    <project-name>
  Iteration:  <n> / <max>
  Phase:      <plan|build|review>
  Provider:   <provider>
  Work dir:   <work-dir>
```

## Step 3: Read current plan and git context

From `<work-dir>`:
1. Read `TODO.md` and identify the first incomplete `- [ ]` task.
2. Run:
   - `git rev-parse HEAD`
   - `git log --oneline -5`

## Step 4: Check for queued steering

Check whether `~/.aloop/sessions/<session-id>/STEERING.md` already exists.

- If it exists, ask whether to:
  - Overwrite
  - Append
  - Cancel

If canceled, stop without changes.

## Step 5: Interview for steering instruction

Ask:
1. What direction should change? (free text)
2. Does this affect completed work? (`yes`, `no`, or `unknown`)

## Step 6: Write STEERING.md

Create or update `~/.aloop/sessions/<session-id>/STEERING.md`:

```markdown
# Steering Instruction

**Commit:** <head-sha>
**Timestamp:** <iso-timestamp>
**Affects completed work:** <yes|no|unknown>

## Instruction

<user direction, verbatim, with minimal clarifying context>

## Loop State at Steering Time

**Phase:** <plan|build|review>
**Current task:** <first unchecked TODO item, or "none - all complete">
**Recent commits:**
<last 5 git log lines>
```

## Step 7: Confirm

Display:
```
Steering instruction queued.

  Session:     <session-id>
  Picks up at: start of next iteration
  Session dir: ~/.aloop/sessions/<session-id>/
```
