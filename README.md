# Ralph — Autonomous AI Coding Loop

Ralph is Geoffrey Huntley's autonomous AI coding methodology, packaged as an installable skill for Claude Code, Codex CLI, GitHub Copilot, and Gemini CLI. It runs plan-build-review loops with multi-provider support, backpressure validation, and stuck detection.

## What is Ralph?

Ralph is an iterative coding loop: feed a prompt to an AI coding agent, the agent completes one task, commits, and exits. The loop restarts with fresh context. Three phases cycle:

1. **Plan** — Gap analysis between specs and code, outputs prioritized TODO
2. **Build** — Picks one task, implements, validates, commits
3. **Review** — Audits the last build against 5 quality gates

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| **PowerShell** | 7.x (`pwsh`) | Required to run `install.ps1` and `loop.ps1`. Install: `winget install Microsoft.PowerShell` or https://aka.ms/pscore6 |
| **Git** | any recent | Must be on `$PATH`. Required for commits, branches, and worktree isolation. |
| **Node.js + npm** | 18 LTS | Required only to install provider CLIs via `npm install -g`. Install: `winget install OpenJS.NodeJS.LTS` or https://nodejs.org |
| **At least one provider CLI** | — | `claude`, `codex`, `gemini`, or `copilot` — see [Provider CLIs](#provider-clis) below |

### Provider CLIs

The installer detects which CLIs are present and offers to install missing ones automatically.

| Provider | CLI binary | Install | Auth |
|----------|-----------|---------|------|
| **Claude Code** | `claude` | `npm install -g @anthropic-ai/claude-code` | `claude auth` or `$env:ANTHROPIC_API_KEY` |
| **OpenAI Codex** | `codex` | `npm install -g @openai/codex` | `codex auth` or `$env:OPENAI_API_KEY` |
| **Gemini CLI** | `gemini` | `npm install -g @google/gemini-cli` | `gemini auth` (free browser OAuth) or `$env:GEMINI_API_KEY` |
| **GitHub Copilot** | `copilot` | `npm install -g @github/copilot` | Run `copilot` and use `/login`, or set `$env:GH_TOKEN` / `$env:GITHUB_TOKEN` |

> **Copilot CLI note:** Requires an active GitHub Copilot subscription.

### Persisting API keys

Add keys to your PowerShell profile so they survive reboots:

```powershell
code $PROFILE   # open profile in VS Code, then add:
```
```powershell
$env:ANTHROPIC_API_KEY = 'sk-ant-...'
$env:OPENAI_API_KEY    = 'sk-...'
$env:GEMINI_API_KEY    = 'AIza...'
```

## Platform Support

| Component | Windows | macOS | Linux |
|-----------|:-------:|:-----:|:-----:|
| `install.ps1` | ✅ | ✅ (requires `pwsh`) | ✅ (requires `pwsh`) |
| `loop.ps1` | ✅ | ✅ (requires `pwsh`) | ✅ (requires `pwsh`) |
| `loop.sh` | ❌ | ✅ | ✅ |
| `winget install` hints in installer | ✅ | ❌ | ❌ |
| All four provider CLIs | ✅ | ✅ | ✅ |

> **macOS/Linux:** Use `loop.sh` (bash), or install `pwsh` and use `loop.ps1`. Path separators in `install.ps1` are handled cross-platform by PowerShell's `Join-Path`.

## Multi-Provider Support

Ralph works with any of these AI coding agents — mix and match, or let them take turns:

| Provider | CLI | Autonomous flag | Slash commands |
|----------|-----|-----------------|----------------|
| Claude Code | `claude` | `--dangerously-skip-permissions --print` | `/ralph:setup`, `/ralph:start`, etc. |
| Codex CLI | `codex` | `--dangerously-bypass-approvals-and-sandbox` | `/ralph:setup`, `/ralph:start`, etc. |
| GitHub Copilot | `copilot` | `--yolo` | skill only (no slash commands) |
| Gemini CLI | `gemini` | `--yolo` | — |

**Round-robin mode** cycles through providers each iteration — e.g. Claude plans, Codex builds, Gemini reviews.

```powershell
# Single provider
~/.ralph/bin/loop.ps1 -Provider claude

# Explicit round-robin
~/.ralph/bin/loop.ps1 -Provider round-robin -RoundRobinProviders claude,codex,gemini

# Per-provider model override
~/.ralph/bin/loop.ps1 -Provider codex -CodexModel gpt-5.3-codex
```

> **Gemini note:** The `-m <model>` flag is version-dependent. The loop automatically retries without the flag if the specified model is rejected.
>
> **Copilot note:** The loop uses a retry chain: preferred model → fallback model → no explicit model flag. Auth errors are detected from output text and surface as hard failures.

## Installation

```powershell
# Interactive — detects missing CLIs, then choose which harnesses to install
./install.ps1

# Install everything without prompting (also auto-installs any missing CLIs via npm)
./install.ps1 -All

# Pre-select specific harnesses (still checks for missing CLIs interactively)
./install.ps1 -Harnesses claude,codex

# Force overwrite existing files
./install.ps1 -Force

# Skip CLI detection/install entirely (useful for CI)
./install.ps1 -SkipCliCheck

# Preview what would be installed (no changes made)
./install.ps1 -DryRun
```

### What the installer does

1. **Detects provider CLIs** — shows `[OK]` / `[MISSING]` for `claude`, `codex`, `gemini`, `copilot`
2. **Offers to install missing CLIs** via `npm install -g <package>` (skipped if npm is absent; all installed automatically with `-All`)
3. **Installs skill files** into the selected harness directories
4. **Installs the Ralph runtime** (`~/.ralph/` — config, loop scripts, templates)
5. **Prints auth instructions** for every provider at the end, with `[installed]`/`[not found]` badges

### What gets installed where

| Harness | Skill | Commands / Prompts |
|---------|-------|--------------------|
| Claude Code | `~/.claude/skills/ralph/` | `~/.claude/commands/ralph/` (5 slash commands) |
| Codex CLI | `~/.codex/skills/ralph/` | `~/.codex/commands/ralph/` (5 slash commands) |
| GH Copilot (VS Code) | `~/.copilot/skills/ralph/` | `%APPDATA%\Code\User\prompts\` (4 `.prompt.md`) |
| GH Copilot (VS Code Insiders) | `~/.copilot/skills/ralph/` | `%APPDATA%\Code - Insiders\User\prompts\` (4 `.prompt.md`) |
| Agents (generic) | `~/.agents/skills/ralph/` | — |

VS Code prompt files are installed automatically for any VS Code variant that is present — independently of which harness you select in the interactive menu.

The Ralph runtime always goes to `~/.ralph/` regardless of harness selection.

## Usage

In any project with Claude Code or Codex:

```
/ralph:setup     Configure Ralph for the current project
/ralph:start     Launch a loop
/ralph:status    Check running sessions
/ralph:stop      Stop a loop
/ralph:steer     Send a live steering instruction to a running loop
```

In VS Code (stable or Insiders) with GitHub Copilot, type `/` and select:

```
/ralph-setup     Configure Ralph for the current project
/ralph-start     Launch a loop
/ralph-status    Check running sessions
/ralph-stop      Stop a loop
```

The skill (`~/.copilot/skills/ralph/`) is also loaded automatically by Copilot based on context.

`/ralph:setup` and `/ralph-setup` are discovery-first and interview-first: they use `~/.ralph/bin/setup-discovery.ps1` to auto-detect repo context (project root/hash, language, validation presets, providers, existing Ralph config), run a spec/context interview first, and ask loop run details only after explicit user go-ahead.

When no strong spec exists, setup defaults to a short interview to create/refine `SPEC.md` instead of forcing a spec-path-first workflow.

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
    steer.md                    # /ralph:steer — live steering

~/.copilot/
  skills/ralph/
    SKILL.md                    # Same skill, no commands dir

%APPDATA%\Code\User\prompts\             (VS Code stable)
%APPDATA%\Code - Insiders\User\prompts\ (VS Code Insiders)
    ralph-setup.prompt.md       # /ralph-setup
    ralph-start.prompt.md       # /ralph-start
    ralph-status.prompt.md      # /ralph-status
    ralph-stop.prompt.md        # /ralph-stop

~/.ralph/
  config.yml                   # Global defaults (providers, models)
  bin/
    loop.ps1                   # PowerShell loop (Windows / macOS / Linux)
    loop.sh                    # Bash loop (macOS / Linux)
    setup-discovery.ps1        # Discovery + scaffold script for /ralph:setup
  templates/
    PROMPT_plan.md             # Plan template with {{variables}}
    PROMPT_build.md            # Build template
    PROMPT_review.md           # Review template (+ REVIEW_LOG.md tracking)
    PROMPT_steer.md            # Steering template (spec-update agent)
  projects/<hash>/             # Per-project config
    config.yml
    prompts/                   # Generated project-specific prompts
  sessions/<id>/               # Per-session state
    meta.json, status.json, log.jsonl, report.md

<project work-dir>/           # Lives in the project (or worktree)
  TODO.md                     # Task plan (volatile — regenerated each plan cycle)
  RESEARCH.md                 # Planner research log (append-only, never deleted)
  REVIEW_LOG.md               # Reviewer findings log (append-only, never deleted)
```

## Key Features

- **Multi-provider**: Claude, Codex, Gemini, Copilot — single provider or round-robin
- **Multi-harness install**: One installer, choose Claude Code / Codex / Copilot / Agents
- **Auto-installs CLIs**: Detects missing providers at install time and installs via npm
- **Plan-build-review cycle**: Three distinct mindsets per iteration (plan → build × 3 → review)
- **Backpressure**: Tests/types/lints gate every commit
- **Stuck detection**: Auto-skip tasks after N consecutive failures
- **Live steering**: Send mid-flight direction changes via `/ralph:steer` — loop picks up `STEERING.md` at the next iteration boundary, invokes a spec-update agent, force-replans, then resumes
- **Persistent research log**: Planner appends timestamped findings to `RESEARCH.md` (append-only) — survives TODO regenerations, prevents re-researching already-investigated topics across runs
- **Review log**: Persistent `REVIEW_LOG.md` tracks every review verdict and resolved findings across iterations
- **Worktree isolation**: Loops run on separate git branches
- **Session tracking**: Status, logs, and reports per session
- **Minimal repo footprint**: Runtime/session state is in `~/.ralph/`; project working files are `TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md` (and temporary `STEERING.md` while steering is being processed)

## Development

This repo is the development/source location. Edit files here, then run `install.ps1` to deploy to the live harness directories.
