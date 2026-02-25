# Ralph — Autonomous AI Coding Loop

Ralph is Geoffrey Huntley's autonomous AI coding methodology, packaged as an installable skill for Claude Code, Codex CLI, and GitHub Copilot (VS Code). It runs plan-build-review loops with multi-provider support, backpressure validation, and stuck detection.

## What is Ralph?

Ralph is an iterative coding loop: feed a prompt to an AI coding agent, the agent completes one task, commits, and exits. The loop restarts with fresh context. Three phases cycle:

1. **Plan** — Gap analysis between specs and code, outputs prioritized TODO
2. **Build** — Picks one task, implements, validates, commits
3. **Review** — Audits the last build against 5 quality gates

## Multi-Provider Support

Ralph works with any of these AI coding agents — mix and match, or let them take turns:

| Provider | CLI | Autonomous Flag | Commands |
|----------|-----|-----------------|----------|
| Claude Code | `claude` | `--dangerously-skip-permissions --print` | `/ralph:setup`, `/ralph:start`, etc. |
| Codex CLI | `codex` | `--dangerously-bypass-approvals-and-sandbox` | `/ralph:setup`, `/ralph:start`, etc. |
| GH Copilot (VS Code) | `copilot` | `--yolo` | skill only (no slash commands) |
| Gemini | `gemini` | `--yolo` | — |

**Round-robin mode** cycles through providers each iteration for diversity — e.g. Claude plans, Codex builds, Gemini reviews.

```powershell
# Single provider
.\loop.ps1 -Provider claude

# Explicit round-robin
.\loop.ps1 -Provider round-robin -RoundRobinProviders claude,codex,gemini

# Per-provider model override
.\loop.ps1 -Provider codex -CodexModel gpt-5.3-codex
```

## Installation

```powershell
# Interactive — choose which harnesses to install into
./install.ps1

# Install all harnesses at once
./install.ps1 -All

# Pre-select specific harnesses
./install.ps1 -Harnesses claude,codex

# Force overwrite existing files
./install.ps1 -Force

# Preview what would be installed
./install.ps1 -DryRun
```

### What gets installed where

| Harness | Skill | Commands |
|---------|-------|----------|
| Claude Code | `~/.claude/skills/ralph/` | `~/.claude/commands/ralph/` (4 slash commands) |
| Codex CLI | `~/.codex/skills/ralph/` | `~/.codex/commands/ralph/` (4 slash commands) |
| GH Copilot (VS Code) | `~/.copilot/skills/ralph/` | — (uses `.prompt.md` instead) |
| Agents (generic) | `~/.agents/skills/ralph/` | — |

The Ralph runtime (loop scripts, config, templates) always goes to `~/.ralph/`.

## Usage

In any project with Claude Code or Codex:

```
/ralph:setup     Configure Ralph for the current project
/ralph:start     Launch a loop
/ralph:status    Check running sessions
/ralph:stop      Stop a loop
```

GH Copilot users invoke the skill via `/ralph` (slash command from SKILL.md) or let Copilot load it automatically based on context.

## Architecture

```
~/.claude/   (or ~/.codex/)
  skills/ralph/
    SKILL.md                    # Background knowledge (auto-loaded)
    references/                 # 4 methodology reference files
  commands/ralph/               # Claude + Codex only
    setup.md                    # /ralph:setup — configure project
    start.md                    # /ralph:start — launch loop
    status.md                   # /ralph:status — check sessions
    stop.md                     # /ralph:stop — stop loop

~/.copilot/
  skills/ralph/
    SKILL.md                    # Same skill, no commands dir

~/.ralph/
  config.yml                   # Global defaults (providers, models)
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

- **Multi-provider**: Claude, Codex, Gemini, Copilot — single provider or round-robin
- **Multi-harness install**: One installer, choose Claude Code / Codex / Copilot / Agents
- **Plan-build-review cycle**: Three distinct mindsets per iteration
- **Backpressure**: Tests/types/lints gate every commit
- **Stuck detection**: Auto-skip tasks after N consecutive failures
- **Worktree isolation**: Loops run on separate git branches
- **Session tracking**: Status, logs, and reports per session
- **No repo pollution**: All state in `~/.ralph/`, nothing in your project

## Development

This repo is the development/source location. Edit files here, then run `install.ps1` to deploy to the live harness directories.
