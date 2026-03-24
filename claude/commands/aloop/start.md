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
- `--mode loop` → `--mode loop` (forces loop mode regardless of project config)
- `--mode orchestrate` → `--mode orchestrate` (forces orchestrator mode regardless of project config)
- `--provider <name>` → `--provider <name>`
- `--in-place` → `--in-place`
- `--max <n>` → `--max-iterations <n>` (works for both loop and orchestrate modes)
- `--launch <mode>` → `--launch <mode>` (start, restart, or resume)
- `--resume` → `--launch resume` (shorthand)
- `--restart` → `--launch restart` (shorthand)
- No args → no extra flags (CLI uses project config defaults; reads `mode` from config to dispatch to loop or orchestrator)

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
- `aloop start` is the single entry point for both loop and orchestrator modes. It reads `mode` from project config (`~/.aloop/projects/<hash>/config.yml`) to dispatch automatically.
- `--mode orchestrate` overrides config to force orchestrator mode; `--mode loop` overrides config to force loop mode (plan-build-review).
- `--launch resume` works for both loop and orchestrator sessions. The CLI auto-detects the session type from `meta.json`.
</notes>
