---
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

<objective>
Send a live steering instruction to a running Aloop session. Analyse loop state, interview the user for details, and write a structured STEERING.md to the session directory for the loop to pick up at the next iteration boundary.
</objective>

<process>

## Step 1: Find the Active Session

Read `~/.aloop/active.json`. If no active sessions, display: "No active Aloop sessions. Start one with `/$skillName:start` first." and stop.

If multiple sessions exist, ask using AskUserQuestion:
- "Which session do you want to steer?" (list session IDs with project names)

Read `~/.aloop/sessions/<session-id>/status.json` and `meta.json` for the chosen session.

## Step 2: Show Loop State

Display to set context:

```
Steering session: <session-id>
  Project:    <project-name>
  Iteration:  <n> / <max>
  Phase:      <plan|build|review>
  Provider:   <provider>
  Work dir:   <work-dir>
  Updated:    <relative time, e.g. "2 minutes ago">
```

## Step 3: Read Current Plan and Git State

Read `<work-dir>/TODO.md` to understand the current task queue and first incomplete task.

Get the current git state:
```bash
git -C <work-dir> rev-parse HEAD
git -C <work-dir> log --oneline -5
```

## Step 4: Check for Pending Steering

Check if `~/.aloop/sessions/<session-id>/STEERING.md` already exists (a previous instruction not yet processed).

If it does, ask using AskUserQuestion: "A steering instruction is already queued and hasn't been processed yet. What do you want to do?"
- Option 1: **Overwrite** — replace with new instruction
- Option 2: **Append** — add to the existing instruction
- Option 3: **Cancel** — keep the existing instruction, abort

## Step 5: Interview the User

Ask using AskUserQuestion (can batch):

**Question 1:** "What do you want to change about the current direction?" (free text)

**Question 2:** "Will this affect already-completed work?"
- Option 1: No — only future tasks change
- Option 2: Yes — some completed work needs to be revised
- Option 3: Not sure

## Step 6: Produce STEERING.md

Write `~/.aloop/sessions/<session-id>/STEERING.md` (overwrite or append per Step 4 choice):

```markdown
# Steering Instruction

**Commit:** <HEAD-sha>
**Timestamp:** <iso-timestamp>
**Affects completed work:** <yes|no|unknown>

## Instruction

<user's full instruction — verbatim, plus any clarifying context from the interview>

## Loop State at Steering Time

**Phase:** <plan|build|review>
**Current task:** <first `- [ ]` line from TODO.md, or "none — all complete">
**Recent commits:**
<last 5 lines of git log --oneline>
```

## Step 7: Confirm

Display:

```
Steering instruction queued.

  Session:        <session-id>
  Picks up at:    start of next iteration

The loop will invoke a spec-update agent to apply the changes to specs
and TODO.md, then force a re-plan before resuming normal build cycles.

  Session dir: ~/.aloop/sessions/<session-id>/
```

</process>

<notes>
- Write STEERING.md to the SESSION directory (`~/.aloop/sessions/<id>/`), not the project work directory. The loop copies it to WorkDir just before invoking the spec-update agent.
- The work directory is the worktree path from meta.json, not necessarily the project root.
- The loop processes one STEERING.md per iteration. If the agent fails, STEERING.md remains and will be retried on the next iteration.
- There is no way to interrupt a mid-flight agent call — the instruction is always picked up at an iteration boundary.
</notes>
