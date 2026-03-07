---
name: aloop-dashboard
description: Launch the Aloop dashboard by delegating to the `aloop dashboard` CLI command.
argument-hint: "[--port N] [--session-dir PATH] [--workdir PATH] [--assets-dir PATH]"
agent: agent
---

Launch the Aloop dashboard by running the `aloop dashboard` CLI command.

## Step 1: Translate Arguments

Map any user-provided arguments to `aloop dashboard` flags:
- `--port <n>` -> `--port <n>`
- `--session-dir <path>` -> `--session-dir <path>`
- `--workdir <path>` -> `--workdir <path>`
- `--assets-dir <path>` -> `--assets-dir <path>`
- No args -> no extra flags (CLI defaults to port `3000`)

## Step 2: Run `aloop dashboard`

```bash
aloop dashboard [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs dashboard [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

> Note: The dashboard command serves both API and frontend for live session state.

