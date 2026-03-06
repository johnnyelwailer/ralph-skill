---
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

<objective>
Launch an Aloop loop for the current project by delegating to `aloop start`.
</objective>

<process>

## Step 1: Translate Arguments

Map any user-provided arguments after `/$skillName:start` to `aloop start` flags:
- `--plan` → `--plan`
- `--build` → `--build`
- `--review` → `--review`
- `--provider <name>` → `--provider <name>`
- `--in-place` → `--in-place`
- `--max <n>` → `--max-iterations <n>`
- No args → no extra flags (CLI uses project config defaults)

## Step 2: Run `aloop start`

Run the CLI command with the translated flags:

```bash
aloop start [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs start [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user of available commands:
- `/$skillName:status` — check progress
- `/$skillName:steer` — adjust the loop
- `/$skillName:stop` — stop the loop

</process>

<notes>
- The `aloop start` CLI handles all session setup: resolve, config, session creation, worktree, loop launch, dashboard, and active registration.
- Do not duplicate any of that logic here — just call the CLI and report results.
- If the user has not run setup yet, the CLI will report a clear error.
</notes>
