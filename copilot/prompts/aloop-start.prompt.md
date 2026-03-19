---
name: aloop-start
description: Launch an Aloop autonomous coding loop for the current project by delegating to the `aloop start` CLI.
argument-hint: "[--plan|--build|--review] [--provider claude|codex|gemini|copilot] [--in-place] [--max N] [--launch start|restart|resume]"
agent: agent
---

Launch an Aloop loop for the current project by running the `aloop start` CLI command.

## Step 1: Translate Arguments

Map any user-provided arguments to `aloop start` flags:
- `--plan` → `--plan`
- `--build` → `--build`
- `--review` → `--review`
- `--provider <name>` → `--provider <name>`
- `--in-place` → `--in-place`
- `--max <n>` → `--max-iterations <n>`
- `--launch <mode>` → `--launch <mode>` (start, restart, or resume)
- `--resume` → `--launch resume` (shorthand)
- `--restart` → `--launch restart` (shorthand)
- No args → no extra flags (CLI uses project config defaults)

## Step 2: Run `aloop start`

```bash
aloop start [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs start [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user:
- `/aloop-status` — check progress
- `/aloop-stop` — stop the loop
