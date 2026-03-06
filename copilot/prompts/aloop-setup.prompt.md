---
name: aloop-setup
description: Configure Aloop autonomous coding loop for the current project by delegating to the `aloop setup` CLI.
agent: agent
---

Configure Aloop for the current project by running the `aloop setup` CLI command.

## Step 1: Translate Arguments

Map any user-provided arguments to `aloop setup` flags:
- `--spec <path>` -> `--spec <path>`
- `--providers <csv>` -> `--providers <csv>`
- `--non-interactive` -> `--non-interactive`
- `--project-root <path>` -> `--project-root <path>`
- `--home-dir <path>` -> `--home-dir <path>`

## Step 2: Run `aloop setup`

```bash
aloop setup [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs setup [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user:
- `/aloop-start` - launch a loop
- `/aloop-status` - check progress

> Note: The `aloop setup` CLI handles discovery, prompting, and scaffolding.
