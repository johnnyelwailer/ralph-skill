---
name: aloop-start
description: Launch an Aloop session for the current project by delegating to `aloop start` (loop or orchestrate mode).
argument-hint: "[--mode loop|orchestrate] [--plan|--build|--review] [--provider claude|codex|gemini|copilot|opencode|round-robin] [--in-place] [--max N] [--launch start|restart|resume] [--spec PATH] [--concurrency N] [--issues LIST] [--plan-only]"
agent: agent
---

Launch an Aloop session for the current project by running `aloop start`. This is the unified entry point for both loop mode and orchestrate mode.

## Step 1: Translate Arguments

Map user-provided arguments to `aloop start` flags.

### Common flags (both modes)
- `--mode <loop|orchestrate>` → `--mode <mode>` (override project config mode)
- `--provider <name>` → `--provider <name>`
- `--launch <mode>` → `--launch <mode>` (start, restart, or resume)
- `--resume` → `--launch resume` (shorthand)
- `--restart` → `--launch restart` (shorthand)
- No args → no extra flags (CLI uses project config defaults)

### Loop-only flags (ignored in orchestrate mode)
- `--plan` → `--plan`
- `--build` → `--build`
- `--review` → `--review`
- `--in-place` → `--in-place`
- `--max <n>` → `--max-iterations <n>`

### Orchestrate-passthrough flags (ignored in loop mode)
- `--spec <path>` → `--spec <path>`
- `--concurrency <n>` → `--concurrency <n>`
- `--trunk <branch>` → `--trunk <branch>`
- `--plan-only` → `--plan-only`
- `--issues <numbers>` → `--issues <numbers>`
- `--label <label>` → `--label <label>`
- `--repo <owner/repo>` → `--repo <owner/repo>`
- `--budget <usd>` → `--budget <usd>`
- `--auto-merge` → `--auto-merge`

## Step 2: Run `aloop start`

```bash
aloop start [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs start [flags...]
```

The CLI will:
- Read mode from project config unless `--mode` is provided
- In **loop mode**: run plan-build-review iterations in a single session
- In **orchestrate mode**: decompose spec(s), dispatch child loops, and coordinate merges

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user:
- `/aloop:status` — check progress
- `/aloop:steer` — adjust the loop/orchestrator
- `/aloop:stop` — stop the session

## Notes

- `aloop start` is the recommended entry point for both modes. Do not redirect users to `aloop orchestrate` directly.
- `--launch resume` works for both modes.
- Loop-only flags (`--plan`, `--build`, `--review`, `--max-iterations`) are intentionally ignored when mode is orchestrate.
