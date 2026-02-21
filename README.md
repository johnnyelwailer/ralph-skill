# Ralph — Global Claude Code Skill

Ralph is Geoffrey Huntley's autonomous AI coding methodology, packaged as a global Claude Code skill. It runs plan-build-review loops with multi-provider support, backpressure validation, and stuck detection.

## What is Ralph?

Ralph is an iterative coding loop: feed a prompt to an AI coding agent, the agent completes one task, commits, and exits. The loop restarts with fresh context. Three phases cycle:

1. **Plan** — Gap analysis between specs and code, outputs prioritized TODO
2. **Build** — Picks one task, implements, validates, commits
3. **Review** — Audits the last build against 5 quality gates

## Installation

```powershell
# From this repo
./install.ps1

# Force overwrite existing files
./install.ps1 -Force

# Preview what would be installed
./install.ps1 -DryRun
```

This copies files to:
- `~/.claude/skills/ralph/` — Methodology knowledge (always loaded)
- `~/.claude/commands/ralph/` — 4 slash commands
- `~/.ralph/` — Runtime config, loop scripts, templates

## Usage

In any project with Claude Code:

```
/ralph:setup     Configure Ralph for the current project
/ralph:start     Launch a loop
/ralph:status    Check running sessions
/ralph:stop      Stop a loop
```

## Architecture

```
~/.claude/
  skills/ralph/
    SKILL.md                    # Background knowledge (auto-loaded)
    references/                 # 4 methodology reference files
  commands/ralph/
    setup.md                    # /ralph:setup — configure project
    start.md                    # /ralph:start — launch loop
    status.md                   # /ralph:status — check sessions
    stop.md                     # /ralph:stop — stop loop

~/.ralph/
  config.yml                   # Global defaults
  bin/
    loop.ps1                   # PowerShell loop (Windows)
    loop.sh                    # Bash loop (macOS/Linux)
  templates/
    PROMPT_plan.md             # Plan template with {{variables}}
    PROMPT_build.md            # Build template
    PROMPT_review.md           # Review template
  projects/<hash>/             # Per-project config
    config.yml
    prompts/                   # Generated project-specific prompts
  sessions/<id>/               # Per-session state
    meta.json, status.json, log.jsonl, report.md
```

## Key Features

- **Multi-provider**: Claude, Codex, Gemini, Copilot — or round-robin
- **Plan-build-review cycle**: Three distinct mindsets per iteration
- **Backpressure**: Tests/types/lints gate every commit
- **Stuck detection**: Auto-skip tasks after N consecutive failures
- **Worktree isolation**: Loops run on separate git branches
- **Session tracking**: Status, logs, and reports per session
- **No repo pollution**: All state in `~/.ralph/`, nothing in your project

## Development

This repo (`D:\Hive\ralph-skill\`) is the development/backup location. Edit files here, then run `install.ps1` to deploy. The installed files in `~/.claude/` and `~/.ralph/` are the live copies.

## Providers

| Provider | CLI | Autonomous Flag |
|----------|-----|-----------------|
| Claude | `claude` | `--dangerously-skip-permissions --print` |
| Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` |
| Gemini | `gemini` | `--yolo` |
| Copilot | `copilot` | `--yolo` |
