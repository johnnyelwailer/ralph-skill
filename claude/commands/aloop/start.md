---
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

<objective>
Launch an Aloop session for the current project by delegating to `aloop start`. This is the unified entry point for both loop mode and orchestrate mode — the CLI reads mode from project config and dispatches accordingly.
</objective>

<process>

## Step 1: Translate Arguments

Map any user-provided arguments after `/$skillName:start` to `aloop start` flags.

### Common flags (both modes)
- `--mode <loop|orchestrate>` → `--mode <mode>` (override project config; default comes from `.aloop/config.json`)
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
- `--spec <path>` → `--spec <path>` (specification file to decompose, default: `SPEC.md`)
- `--concurrency <n>` → `--concurrency <n>` (max concurrent child loops, default: 3)
- `--trunk <branch>` → `--trunk <branch>` (target branch for merged PRs, default: `agent/trunk`)
- `--plan-only` → `--plan-only` (create issues without launching loops)
- `--issues <numbers>` → `--issues <numbers>` (comma-separated issue numbers to process)
- `--label <label>` → `--label <label>` (GitHub label to filter issues)
- `--repo <owner/repo>` → `--repo <owner/repo>` (GitHub repository)
- `--budget <usd>` → `--budget <usd>` (session budget cap)
- `--auto-merge` → `--auto-merge` (create PR from trunk to main)

## Step 2: Run `aloop start`

Run the CLI command with the translated flags:

```bash
aloop start [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs start [flags...]
```

The CLI will:
- Read mode from project config (`.aloop/config.json`) unless `--mode` is specified
- In **loop mode**: run a plan-build-review loop as a single agent session
- In **orchestrate mode**: decompose a spec into issues, dispatch child loops, and merge PRs

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

Remind the user of available commands:
- `/$skillName:status` — check progress
- `/$skillName:steer` — adjust the loop
- `/$skillName:stop` — stop the loop

</process>

<notes>
- `aloop start` is the recommended entry point for both loop and orchestrate modes. Do not direct users to `aloop orchestrate` directly.
- The CLI handles all session setup: config resolution, session creation, worktree, loop/orchestrator launch, dashboard, and active registration.
- Do not duplicate any of that logic here — just call the CLI and report results.
- If the user has not run setup yet, the CLI will report a clear error.
- `--launch resume` works for both modes — it resumes the most recent session of the configured mode.
- Loop-only flags (`--plan`, `--build`, `--review`, `--max-iterations`) are silently ignored when mode is orchestrate.
</notes>
