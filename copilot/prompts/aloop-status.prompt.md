---
name: aloop-status
description: Display status of all running Aloop loop sessions and provider health.
agent: agent
---

Display the status of all running Aloop sessions and provider health.

## Step 1: Run CLI

Run `aloop status` (fallback: `node ~/.aloop/cli/aloop.mjs status`).

Display the output as-is.

If the command fails, report the error to the user.

> Note: Use `aloop status --output json` if machine-readable output is needed.
