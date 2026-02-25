---
name: aloop-start
description: Launch a Aloop autonomous coding loop for the current project. Accepts --plan, --build, --review, --provider, --in-place, --max flags.
argument-hint: "[--plan|--build|--review] [--provider claude|codex|gemini|copilot] [--in-place] [--max N]"
agent: agent
---

Launch a Aloop loop for the current project. Create a session, optionally set up a git worktree, and start the loop script.

## Step 1: Find Project Config

1. Find the git root of the current working directory
2. Compute the project hash (first 8 chars of SHA-256 of absolute path)
3. Check if `~/.aloop/projects/<hash>/config.yml` exists
4. If not found: "No Aloop configuration found for this project. Run `/aloop-setup` first."

## Step 2: Parse Arguments

Check for arguments passed after invoking this prompt:
- `--plan` → override mode to `plan`
- `--build` → override mode to `build`
- `--review` → override mode to `review`
- `--provider <name>` → override provider
- `--in-place` → skip worktree, run in current directory
- `--max <n>` → override max iterations
- No args → use defaults from project config

## Step 3: Create Session

1. Generate session ID: `<project-name>-<timestamp>` (e.g., `my-app-20260221-143052`)
2. Create `~/.aloop/sessions/<session-id>/`
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
     "created_at": "<timestamp>"
   }
   ```

## Step 4: Set Up Worktree (unless --in-place)

Unless `--in-place`:
1. Create branch: `aloop/<session-id>`
2. Run: `git worktree add ~/.aloop/sessions/<session-id>/worktree -b aloop/<session-id>`
3. Work directory = worktree path

If `--in-place`, work directory = project root.

## Step 5: Register Active Session

Read `~/.aloop/active.json` (create as `[]` if missing). Add the new session entry. Write back.

## Step 6: Launch Loop

Determine script: `~/.aloop/bin/loop.ps1` (Windows) or `~/.aloop/bin/loop.sh` (macOS/Linux).

Read `enabled_providers`, `models`, and `round_robin_order` from project config and pass to loop.

**PowerShell:**
```powershell
& ~/.aloop/bin/loop.ps1 `
  -PromptsDir "~/.aloop/sessions/<session-id>/prompts" `
  -SessionDir "~/.aloop/sessions/<session-id>" `
  -WorkDir "<work-directory>" `
  -Mode <mode> -Provider <provider> `
  -RoundRobinProviders <enabled-csv> `
  -ClaudeModel <m> -CodexModel <m> -GeminiModel <m> -CopilotModel <m> `
  -MaxIterations <max>
```

**Bash:**
```bash
~/.aloop/bin/loop.sh \
  --prompts-dir ~/.aloop/sessions/<session-id>/prompts \
  --session-dir ~/.aloop/sessions/<session-id> \
  --work-dir <work-directory> \
  --mode <mode> --provider <provider> \
  --round-robin <enabled-csv> \
  --claude-model <m> --codex-model <m> --gemini-model <m> --copilot-model <m> \
  --max-iterations <max>
```

Launch as a background process. Capture PID and update `active.json`.

## Step 7: Confirm Launch

Display:
```
Aloop loop started!

  Session:  <session-id>
  Mode:     <mode>
  Provider: <provider>
  Work dir: <work-dir>

Monitor:  /aloop-status
Stop:     /aloop-stop
Logs:     ~/.aloop/sessions/<session-id>/log.jsonl
```
