---
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - AskUserQuestion
---

<objective>
Launch a Ralph loop for the current project. Create a session, optionally set up a git worktree, and start the loop script.
</objective>

<process>

## Step 1: Find Project Config

1. Find the git root of the current working directory
2. Compute the project hash (first 8 chars of SHA-256 of absolute path)
3. Check if `~/.ralph/projects/<hash>/config.yml` exists
4. If not found, tell the user: "No Ralph configuration found for this project. Run `/ralph:setup` first."

Read the project config to get provider, mode, validation commands, etc.

## Step 2: Parse Arguments

Check if the user provided arguments after `/ralph:start`:
- `--plan` → override mode to `plan`
- `--build` → override mode to `build`
- `--review` → override mode to `review`
- `--provider <name>` → override provider
- `--in-place` → skip worktree, run in current directory
- `--max <n>` → override max iterations
- No args → use defaults from project config

## Step 3: Create Session

1. Generate a session ID: `<project-name>-<timestamp>` (e.g., `my-app-20260221-143052`)
2. Create session directory: `~/.ralph/sessions/<session-id>/`
3. Copy prompts from `~/.ralph/projects/<hash>/prompts/` to `~/.ralph/sessions/<session-id>/prompts/`
4. Write `~/.ralph/sessions/<session-id>/meta.json`:
   ```json
   {
     "session_id": "<id>",
     "project_name": "<name>",
     "project_root": "<path>",
     "project_hash": "<hash>",
     "provider": "<provider>",
     "mode": "<mode>",
     "max_iterations": 50,
     "worktree": true,
     "worktree_path": "<path>",
     "created_at": "<timestamp>"
   }
   ```

## Step 4: Set Up Worktree (unless --in-place)

Unless `--in-place` was specified:

1. Create a branch name: `ralph/<session-id>`
2. Create a git worktree:
   ```bash
   git worktree add ~/.ralph/sessions/<session-id>/worktree -b ralph/<session-id>
   ```
3. The work directory for the loop is the worktree path

If `--in-place`, the work directory is the project root itself.

## Step 5: Register Active Session

Read `~/.ralph/active.json` (create if doesn't exist as `[]`).
Add the new session:
```json
{
  "session_id": "<id>",
  "project_name": "<name>",
  "project_root": "<path>",
  "pid": null,
  "started_at": "<timestamp>"
}
```
Write back to `~/.ralph/active.json`.

## Step 6: Launch Loop

Determine the loop script based on OS:
- Windows/PowerShell: `~/.ralph/bin/loop.ps1`
- macOS/Linux: `~/.ralph/bin/loop.sh`

Build the command:

**PowerShell:**
```powershell
& ~/.ralph/bin/loop.ps1 `
  -PromptsDir "~/.ralph/sessions/<session-id>/prompts" `
  -SessionDir "~/.ralph/sessions/<session-id>" `
  -WorkDir "<work-directory>" `
  -Mode <mode> `
  -Provider <provider> `
  -MaxIterations <max>
```

**Bash:**
```bash
~/.ralph/bin/loop.sh \
  --prompts-dir "~/.ralph/sessions/<session-id>/prompts" \
  --session-dir "~/.ralph/sessions/<session-id>" \
  --work-dir "<work-directory>" \
  --mode <mode> \
  --provider <provider> \
  --max-iterations <max>
```

Launch the loop as a background process. Capture the PID and update `active.json`.

## Step 7: Confirm Launch

Display to user:

```
Ralph loop started!

  Session: <session-id>
  Mode: <mode>
  Provider: <provider>
  Work directory: <work-dir>
  Prompts: ~/.ralph/sessions/<session-id>/prompts/

Monitor:
  /ralph:status         Check progress
  /ralph:stop           Stop the loop

Session logs:
  ~/.ralph/sessions/<session-id>/log.jsonl
  ~/.ralph/sessions/<session-id>/status.json
```

</process>

<notes>
- Worktree creation requires the project to be a git repo
- If git worktree fails (e.g., branch already exists), fall back to --in-place with a warning
- The loop script handles all provider invocation, stuck detection, and reporting
- Session ID format ensures uniqueness and sortability
- On Windows, prefer PowerShell loop.ps1; on macOS/Linux, prefer loop.sh
</notes>
