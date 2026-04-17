---
name: aloop-dashboard
description: Launch the Aloop dashboard by discovering active sessions and delegating to the `aloop dashboard` CLI command.
argument-hint: "[--port N] [--assets-dir PATH]"
agent: agent
---

Launch the Aloop dashboard by discovering active sessions and running the `aloop dashboard` CLI command.

## Step 1: Discover Active Sessions

Run:

```bash
aloop status --output json
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs status --output json
```

Parse the JSON output and extract `sessions[]` where each session has `session_id` and `work_dir`.

## Step 2: Select Session

**If one active session:**
Use it automatically — proceed to Step 3 with:
- `--session-dir ~/.aloop/sessions/<session_id>`
- `--workdir <work_dir>`

**If multiple active sessions:**
List them to the user:

```
Multiple active sessions found:
  1. <session_id>  (<work_dir>)
  2. <session_id>  (<work_dir>)
  ...
Which session would you like to open? (enter number)
```

Wait for the user's selection, then proceed to Step 3 with the chosen session's flags.

**If no active sessions:**
Inform the user:

```
No active sessions found. Launching dashboard without a specific session.
```

Proceed to Step 3 with no `--session-dir` or `--workdir` flags.

## Step 3: Translate Additional Arguments

Any user-provided flags are passed through:
- `--port <n>` -> `--port <n>`
- `--assets-dir <path>` -> `--assets-dir <path>`
- No additional args -> use CLI defaults (port `3000`)

## Step 4: Run `aloop dashboard`

```bash
aloop dashboard [--session-dir <path>] [--workdir <path>] [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs dashboard [--session-dir <path>] [--workdir <path>] [flags...]
```

## Step 5: Open Browser

After the dashboard starts (look for a "listening" or "started" message in CLI output), open the browser:

```bash
open http://localhost:<port>
```

where `<port>` is the value of `--port` if provided, otherwise `3000`.

On Linux without a desktop environment, print the URL instead:

```
Dashboard running at: http://localhost:<port>
```

## Step 6: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

> Note: The dashboard command serves both API and frontend for live session state.
> Session discovery uses `aloop status --output json` — parse the `sessions` array from the result.
