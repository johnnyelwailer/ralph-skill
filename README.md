![CI](https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg)

# Aloop — Autonomous AI Development System

Aloop runs autonomous AI coding agents in two modes: a **single-session loop** for focused tasks, and a **multi-session orchestrator** that decomposes specs into GitHub issues and dispatches parallel loops. Built on Geoffrey Huntley's autonomous coding methodology with plan-build-review cycles, multi-provider round-robin, backpressure validation, and a real-time dashboard.

## Two Modes of Operation

### Loop Mode (`aloop start`)

A single autonomous coding session. The agent cycles through three phases until all tasks are done:

1. **Plan** — Gap analysis between spec and code, outputs prioritized `TODO.md`
2. **Build** — Picks one task, implements, validates (types/tests/lint), commits
3. **Review** — Audits the build against 9 quality gates, writes fix tasks or approves

Additional agents run between cycles:
- **Proof** — Captures screenshots, API responses, test output as evidence
- **Steer** — Applies live direction changes from the dashboard mid-flight
- **QA** — Tests features as a real user (never reads source code)

Each iteration gets fresh context. The loop handles stuck detection, provider failover, and worktree isolation automatically.

```bash
# Single provider
aloop start --provider claude

# Round-robin across providers
aloop start --provider round-robin

# Resume a stopped session
aloop start <session-id> --launch resume
```

### Orchestrator Mode (`aloop orchestrate`)

A coordination layer that breaks a spec into GitHub issues with dependency graphs, then dispatches parallel child loops — each in its own git worktree.

1. **Decompose** — Reads one or more spec files (including globs), creates GitHub issues with labels and dependency edges
2. **Dispatch** — Launches child loops per issue, respecting concurrency caps and wave ordering
3. **PR lifecycle** — Squash-merges completed PRs, rebases on conflict, runs agent review gates
4. **Budget tracking** — Aggregates cost across child sessions, pauses at 80% of cap

```bash
# Full orchestration from multiple spec files
aloop orchestrate --spec "SPEC.md specs/*.md" --concurrency 3 --budget 50.00

# Plan only (create issues, don't dispatch)
aloop orchestrate --spec "SPEC.md specs/*.md" --plan-only

# Dispatch specific issues
aloop orchestrate --issues 42,43,44 --concurrency 2
```

The orchestrator enforces role-based GitHub policies — child loops can create PRs and comment, but only the orchestrator can merge PRs and close issues.

## Dashboard

Real-time monitoring UI with SSE updates. Runs as a local web server.

```bash
aloop dashboard
aloop dashboard --port 3000 --session-dir ~/.aloop/sessions/<id>
```

- Session sidebar with hierarchy (repo > project > issue > session)
- Live activity log with phase transitions, provider info, and commit history
- Document viewer for TODO.md, SPEC.md, RESEARCH.md, REVIEW_LOG.md
- Proof artifact gallery (screenshots, test output, layout assertions)
- **Live steering** — send instructions to the running loop from the dashboard
- **Stop controls** — graceful (SIGTERM) or force (SIGKILL)

## Quality Gates

The review agent enforces 9 gates on every build iteration:

| Gate | What it checks |
|------|---------------|
| 1. Spec Compliance | Code matches spec intent, not just TODO wording |
| 2. Test Depth | No shallow assertions (`toBeDefined`, `toBeTruthy`) — concrete values only |
| 3. Coverage | ≥80% branch on touched files, ≥90% on new modules |
| 4. Code Quality | No dead code, no copy-paste, no over-engineering |
| 5. Integration Sanity | All existing tests pass, validation commands succeed |
| 6. Proof Verification | Evidence matches changes, screenshots consistent with spec |
| 7. Layout Verification | Playwright bounding-box checks for CSS/layout changes |
| 8. Version Compliance | Installed versions match VERSIONS.md declarations |
| 9. Documentation Freshness | README/docs reflect actual commands, flags, and behavior |

Failed gates produce `[review]` fix tasks that the next build iteration picks up before any new work.

## Pipeline Configuration

All pipeline intervals, thresholds, and caps are config-driven — no hardcoded values. Create `.aloop/pipeline.yml` in your project root to override defaults.

### Loop settings (`.aloop/pipeline.yml`)

```yaml
loop:
  max_iterations: 50            # Max iterations before auto-stopping (0 = unlimited)
  max_stuck: 3                  # Skip a task after N consecutive failures
  inter_iteration_sleep: 3      # Seconds between iterations
  triage_interval: 5            # Run orchestrator triage every N scan iterations
  scan_pass_throttle_ms: 30000  # Min milliseconds between orchestrator scan passes
  rate_limit_backoff: fixed     # Backoff strategy: exponential, linear, or fixed
  cooldown_ladder: [0, 120, 300, 900, 1800, 3600]  # Provider cooldown seconds per failure count
  provider_timeout: 10800       # Max seconds to wait for a provider response
```

These settings are written to `loop-plan.json` at session start and read by loop scripts on startup. Each iteration, loop scripts hot-reload settings from `meta.json`; changes to `meta.json` take effect on the next iteration without restarting.

**Implementation status:**
- `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff` — **Implemented** (also stored in child `loopSettings`; orchestrator reads them directly from `pipeline.yml` at startup and caches them in orchestrator state)
- `max_iterations`, `max_stuck`, `inter_iteration_sleep`, `cooldown_ladder`, `provider_timeout` — **Implemented** (written to `loop-plan.json`, read by loop scripts at startup; hot-reloaded from `meta.json` each iteration)

### Per-agent config (`.aloop/agents/<name>.yml`)

Override reasoning effort, prompt file, or retry behavior per agent:

```yaml
# .aloop/agents/review.yml
prompt: PROMPT_review.md
reasoning: xhigh
timeout: 600
max_retries: 2
retry_backoff: exponential
```

### Orchestrator settings (`.aloop/pipeline.yml`)

The orchestrator reads `concurrency_cap` from `pipeline.yml` (at root level, not under `loop:`):

```yaml
concurrency_cap: 5            # Max parallel child loops
```

`triage_interval`, `scan_pass_throttle_ms`, and `rate_limit_backoff` can be set under `loop:` (shown above) — the orchestrator reads them from `pipeline.yml` regardless of nesting level.

CLI flags always take precedence over config file values.

### Per-project global config (`~/.aloop/projects/<hash>/config.yml`)

Policy preferences that apply across all sessions for a project:

```yaml
autonomy_level: balanced
auto_merge_to_main: false
```

## Providers

Five AI coding agents supported — use one, or round-robin across multiple:

| Provider | CLI | Autonomous flag |
|----------|-----|-----------------|
| Claude Code | `claude` | `--dangerously-skip-permissions --print` |
| OpenAI Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` |
| GitHub Copilot | `copilot` | `--yolo` |
| Gemini CLI | `gemini` | `--yolo` |
| OpenCode | `opencode` | `run --dir <workdir>` |

**Round-robin mode** cycles providers each iteration — e.g., Claude plans, Codex builds, Gemini reviews, OpenCode builds.

### Shipped Agents (OpenCode)

When OpenCode is enabled, `aloop setup` installs three specialist agents to `.opencode/agents/`. Invoke them directly with `opencode run --agent <name>`:

| Agent | Description | Model |
|-------|-------------|-------|
| `code-critic` | Deep code review for subtle bugs and security issues | `claude-sonnet-4` (reasoning: xhigh) |
| `error-analyst` | Parses error logs and stack traces to suggest fixes | `gemini-3.1-flash-lite` (reasoning: medium) |
| `vision-reviewer` | Analyzes screenshots for layout and visual issues | `gemini-3.1-flash-lite` (reasoning: medium) |

```bash
# Run the code critic on your working directory
opencode run --agent code-critic

# Analyze error output
opencode run --agent error-analyst

# Review a screenshot for layout issues
opencode run --agent vision-reviewer
```

These agents run as read-only subagents (no write/edit access) via OpenRouter. Customize them by editing the markdown files in `.opencode/agents/`.

Provider health is tracked automatically. Failed providers enter cooldown with exponential backoff and are skipped until recovery. Auth failures mark a provider as `degraded` — no auto-recovery; the user must re-authenticate (e.g., `gh auth login`).

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| **Git** | any recent | Commits, branches, worktree isolation |
| **Node.js + npm** | 22 LTS | CLI runtime and provider CLI installs |
| **Bash** or **PowerShell 7** | — | `loop.sh` (macOS/Linux) or `loop.ps1` (all platforms) |
| **At least one provider CLI** | — | See provider table above |

### Installing Provider CLIs

```bash
npm install -g @anthropic-ai/claude-code    # Claude Code
npm install -g @openai/codex                 # OpenAI Codex
npm install -g @google/gemini-cli            # Gemini CLI
npm install -g @github/copilot              # GitHub Copilot
# OpenCode — see https://opencode.ai for install instructions
```

## Installation

```powershell
# Interactive — detects missing CLIs, choose harnesses to install
./install.ps1

# Install everything without prompting
./install.ps1 -All

# Force overwrite existing files
./install.ps1 -Force

# Preview what would be installed
./install.ps1 -DryRun
```

The installer deploys skill files to each harness directory and the Aloop runtime to `~/.aloop/`.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `aloop start` | Launch a single-session loop |
| `aloop orchestrate` | Multi-issue decomposition and parallel dispatch |
| `aloop dashboard` | Real-time monitoring UI |
| `aloop status` | List active sessions and provider health |
| `aloop stop <id>` | Stop a running session |
| `aloop setup` | Interactive project configuration |
| `aloop steer` | Send live instruction to a running loop |
| `aloop gh <op>` | Policy-enforced GitHub operations |
| `aloop discover` | Auto-detect project specs and validation |
| `aloop update` | Refresh runtime from repo |
| `aloop devcontainer` | Generate .devcontainer config |

### Slash commands (Claude Code / Codex / Copilot)

```
/aloop:setup       Configure Aloop for the current project
/aloop:start       Launch a loop
/aloop:status      Check running sessions
/aloop:dashboard   Launch the dashboard
/aloop:stop        Stop a loop
/aloop:steer       Send a steering instruction
/aloop:orchestrate Launch multi-issue orchestration
```

## Architecture

```
~/.aloop/
  config.yml                    # Global defaults (providers, models)
  active.json                   # Currently running sessions
  health/<provider>.json        # Per-provider health state
  bin/
    loop.sh                     # Bash loop harness
    loop.ps1                    # PowerShell loop harness
  cli/
    aloop.mjs                   # CLI entry point
  templates/
    PROMPT_plan.md              # Plan agent template
    PROMPT_build.md             # Build agent template
    PROMPT_review.md            # Review agent (9 gates)
    PROMPT_proof.md             # Proof agent template
    PROMPT_steer.md             # Steering agent template
    PROMPT_setup.md             # Setup/discovery agent
    conventions/                # Code quality, testing, git conventions
  sessions/<session-id>/
    meta.json                   # Session metadata
    status.json                 # Current state (iteration, phase, provider)
    log.jsonl                   # Structured event log
    orchestrator.json           # Orchestrator state (issues, waves, PRs)
    prompts/                    # Copied prompt templates
    artifacts/iter-<N>/         # Proof artifacts per iteration
    worktree/                   # Isolated git worktree
    steering-history/           # Archived steering instructions

<project>/
  SPEC.md                       # Project specification (contract)
  VERSIONS.md                   # Dependency version table (enforced)
  TODO.md                       # Task plan (regenerated each plan cycle)
  RESEARCH.md                   # External knowledge log (append-only)
  REVIEW_LOG.md                 # Review findings log (append-only)
  docs/conventions/             # Project-specific conventions
  .aloop/
    pipeline.yml                # Pipeline config (cycle, finalizer, loop settings)
    agents/
      plan.yml                  # Per-agent config overrides (prompt, reasoning, timeout)
      build.yml
      review.yml
```

## Key Features

- **Two modes**: Single-session loop for focused work, orchestrator for spec-to-ship parallelism
- **5 providers**: Claude, Codex, Gemini, Copilot, OpenCode — single or round-robin
- **9 review gates**: Spec compliance, test depth, coverage, code quality, integration, proof, layout, version compliance, documentation freshness
- **Live steering**: Change direction mid-flight without stopping the loop
- **Real-time dashboard**: SSE-powered UI with activity log, docs, proof gallery, and steering controls
- **GitHub integration**: Issue decomposition, PR lifecycle, squash-merge, conflict rebase, agent review
- **Budget tracking**: Cost aggregation across child sessions with configurable caps
- **Provider health**: Automatic cooldown and failover on provider errors
- **Worktree isolation**: Each session runs on its own git branch
- **Backpressure validation**: Types, tests, and lint gate every commit
- **Stuck detection**: Auto-skip tasks after N consecutive failures (configurable via `max_stuck`)
- **Persistent logs**: RESEARCH.md and REVIEW_LOG.md survive TODO regenerations
- **Config-driven pipeline**: All intervals, thresholds, and caps set in `.aloop/pipeline.yml` — no hardcoded values

## Development

This repo is the development/source location. Edit files here, then run `install.ps1` to deploy, or `aloop update` to refresh the runtime.
