---
allowed-tools:
  - Bash
---

<objective>
Display the status of all running Aloop sessions and provider health.
</objective>

<process>

## Step 1: Run CLI

Run `aloop status` (fallback: `node ~/.aloop/cli/aloop.mjs status`).

Display the output as-is.

If the command fails, report the error to the user.

</process>

<notes>
- The CLI reads `~/.aloop/active.json`, per-session `status.json`, and `~/.aloop/health/*.json`
- Use `aloop status --output json` if machine-readable output is needed
</notes>
