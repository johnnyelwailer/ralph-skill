---
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - AskUserQuestion
---

<objective>
Launch a Aloop loop for the current project. Create a session, optionally set up a git worktree, and start the loop script.
</objective>

<process>

## Step 1: Find Project Config

1. Run `aloop resolve` (fallback: `node ~/.aloop/cli/aloop.mjs resolve`) to locate the project root, compute the project hash, and check for an existing config.
2. If the command fails, or if the result shows `config_exists: false`, tell the user: "No Aloop configuration found for this project. Run `/$skillName:setup` first."

Read the project config to get provider, mode, validation commands, etc.

## Step 2: Parse Arguments

Check if the user provided arguments after `/$skillName:start`:
- `--plan` → override mode to `plan`
- `--build` → override mode to `build`
- `--review` → override mode to `review`
- `--provider <name>` → override provider
- `--in-place` → skip worktree, run in current directory
- `--max <n>` → override max iterations
- No args → use defaults from project config

## Step 3: Create Session

1. Generate a session ID: `<project-name>-<timestamp>` (e.g., `my-app-20260221-143052`)
2. Create session directory: `~/.aloop/sessions/<session-id>/`
3. Copy prompts from `~/.aloop/projects/<hash>/prompts/` to `~/.aloop/sessions/<session-id>/prompts/`
4. Write `~/.aloop/sessions/<session-id>/meta.json`:
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

1. Create a branch name: `aloop/<session-id>`
2. Create a git worktree:
   ```bash
   git worktree add ~/.aloop/sessions/<session-id>/worktree -b aloop/<session-id>
   ```
3. The work directory for the loop is the worktree path

If `--in-place`, the work directory is the project root itself.

## Step 5: Register Active Session

Read `~/.aloop/active.json` (create if doesn't exist as `[]`).
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
Write back to `~/.aloop/active.json`.

## Step 6: Launch Loop

Determine the loop script based on OS:
- Windows/PowerShell: `~/.aloop/bin/loop.ps1`
- macOS/Linux: `~/.aloop/bin/loop.sh`

Build the command:

Read the project config to get `enabled_providers`, `models`, and `round_robin_order`. Pass these to the loop script.

**PowerShell:**
```powershell
& ~/.aloop/bin/loop.ps1 `
  -PromptsDir "~/.aloop/sessions/<session-id>/prompts" `
  -SessionDir "~/.aloop/sessions/<session-id>" `
  -WorkDir "<work-directory>" `
  -Mode <mode> `
  -Provider <provider> `
  -RoundRobinProviders <enabled-providers-csv> `
  -ClaudeModel <model> -CodexModel <model> -GeminiModel <model> -CopilotModel <model> `
  -MaxIterations <max>
```

**Bash:**
```bash
~/.aloop/bin/loop.sh \
  --prompts-dir "~/.aloop/sessions/<session-id>/prompts" \
  --session-dir "~/.aloop/sessions/<session-id>" \
  --work-dir "<work-directory>" \
  --mode <mode> \
  --provider <provider> \
  --round-robin "<enabled-providers-csv>" \
  --claude-model <model> --codex-model <model> --gemini-model <model> --copilot-model <model> \
  --max-iterations <max>
```

Only pass model flags for enabled providers. The round-robin list should only contain enabled providers.

Launch the loop as a background process. Capture the PID and update `active.json`.

## Step 7: Confirm Launch

Display to user:

```
Aloop loop started!

  Session: <session-id>
  Mode: <mode>
  Provider: <provider>
  Work directory: <work-dir>
  Prompts: ~/.aloop/sessions/<session-id>/prompts/

Monitor:
  /$skillName:status         Check progress
  /$skillName:stop           Stop the loop

Session logs:
  ~/.aloop/sessions/<session-id>/log.jsonl
  ~/.aloop/sessions/<session-id>/status.json
```

</process>

<notes>
- Worktree creation requires the project to be a git repo
- If git worktree fails (e.g., branch already exists), fall back to --in-place with a warning
- The loop script handles all provider invocation, stuck detection, and reporting
- Session ID format ensures uniqueness and sortability
- On Windows, prefer PowerShell loop.ps1; on macOS/Linux, prefer loop.sh
</notes>
