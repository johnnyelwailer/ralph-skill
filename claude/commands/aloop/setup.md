---
allowed-tools:
  - Bash
  - Read
---

<objective>
Configure Aloop for the current project by delegating to `aloop setup`.
</objective>

<process>

## Step 1: Translate Arguments

Map any user-provided arguments after `/$skillName:setup` to `aloop setup` flags:
- `--spec <path>` -> `--spec <path>`
- `--providers <csv>` -> `--providers <csv>`
- `--non-interactive` -> `--non-interactive`
- `--project-root <path>` -> `--project-root <path>`
- `--home-dir <path>` -> `--home-dir <path>`
- No args -> no extra flags (CLI uses interactive defaults)

## Step 2: Run `aloop setup`

Run the CLI command with the translated flags:

```bash
aloop setup [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs setup [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user of available commands:
- `/$skillName:start` - launch a loop
- `/$skillName:status` - check progress

</process>

<notes>
- The `aloop setup` CLI handles discovery, interactive prompts, and scaffolding.
- Do not duplicate setup orchestration here; delegate to the CLI and report results.
</notes>
