---
name: aloop-orchestrate
description: Initialize an Aloop orchestrator session by delegating to the `aloop orchestrate` CLI.
argument-hint: "[--spec PATH] [--concurrency N] [--trunk BRANCH] [--issues N,N] [--label LABEL] [--repo OWNER/REPO] [--plan-only]"
agent: agent
---

Initialize an Aloop orchestrator session by running the `aloop orchestrate` CLI command.

## Step 1: Translate Arguments

Map any user-provided arguments to `aloop orchestrate` flags:
- `--spec <path>` → `--spec <path>` (specification file to decompose, default: `SPEC.md`)
- `--concurrency <n>` → `--concurrency <n>` (max concurrent child loops, default: 3)
- `--trunk <branch>` → `--trunk <branch>` (target branch for merged PRs, default: `agent/trunk`)
- `--issues <numbers>` → `--issues <numbers>` (comma-separated issue numbers to process)
- `--label <label>` → `--label <label>` (GitHub label to filter issues)
- `--repo <owner/repo>` → `--repo <owner/repo>` (GitHub repository)
- `--plan-only` → `--plan-only` (create issues without launching loops)
- No args → no extra flags (CLI uses defaults)

## Step 2: Run `aloop orchestrate`

```bash
aloop orchestrate [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs orchestrate [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user:
- `/aloop-status` — check progress
- `/aloop-stop` — stop the loop
