---
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

<objective>
Initialize an Aloop orchestrator session by delegating to `aloop orchestrate`.
</objective>

<process>

## Step 1: Translate Arguments

Map any user-provided arguments after `/$skillName:orchestrate` to `aloop orchestrate` flags:
- `--spec <path>` → `--spec <path>` (specification file to decompose, default: `SPEC.md`)
- `--concurrency <n>` → `--concurrency <n>` (max concurrent child loops, default: 3)
- `--trunk <branch>` → `--trunk <branch>` (target branch for merged PRs, default: `agent/trunk`)
- `--issues <numbers>` → `--issues <numbers>` (comma-separated issue numbers to process)
- `--label <label>` → `--label <label>` (GitHub label to filter issues)
- `--repo <owner/repo>` → `--repo <owner/repo>` (GitHub repository)
- `--plan-only` → `--plan-only` (create issues without launching loops)
- No args → no extra flags (CLI uses defaults)

## Step 2: Run `aloop orchestrate`

Run the CLI command with the translated flags:

```bash
aloop orchestrate [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs orchestrate [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user of available commands:
- `/$skillName:status` — check progress
- `/$skillName:steer` — adjust the loop
- `/$skillName:stop` — stop the loop

</process>

<notes>
- The `aloop orchestrate` CLI initializes an orchestrator session that decomposes a spec into issues, dispatches child loops, and merges PRs.
- Do not duplicate any of that logic here — just call the CLI and report results.
- With `--plan-only`, the orchestrator creates issues without launching child loops.
</notes>
