![CI](https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg)

# Aloop — Autonomous AI Development System

Aloop runs autonomous AI coding agents in two modes: a **single-session loop** for focused tasks, and a **multi-session orchestrator** that decomposes specs into GitHub issues and dispatches parallel loops. Built on Geoffrey Huntley's autonomous coding methodology with plan-build-review cycles, multi-provider round-robin, backpressure validation, and a real-time dashboard.

## Two Modes of Operation

### Loop Mode (`aloop start`)

A single autonomous coding session. The default cycle repeats until all tasks are done:

```
plan → build × 5 → qa → review → (repeat)
```

1. **Plan** — Gap analysis between spec and code, outputs prioritized `TODO.md`
2. **Build** — Picks one task, implements, validates (types/tests/lint), commits (runs 5× per cycle)
3. **QA** — Tests features as a real user (never reads source code)
4. **Review** — Audits the build against 9 quality gates, writes fix tasks or approves

When all tasks are marked done, finalizer agents run once:
- **Spec-gap** — Finds discrepancies between spec and implementation
- **Docs** — Syncs documentation to match actual implementation
- **Spec-review** — Reviews spec compliance of the implementation
- **Final-review** — Final code quality audit against all 9 review gates
- **Final-qa** — Final quality assurance pass before proof capture
- **Proof** — Captures screenshots, API responses, test output as evidence

On-demand:
- **Steer** — Applies live direction changes queued from the dashboard

Each iteration gets fresh context. The loop handles stuck detection, provider failover, and worktree isolation automatically.

```bash
# Single provider
aloop start --provider claude

# Round-robin across providers
aloop start --provider round-robin

# Resume a stopped session
aloop start --launch resume <session-id>

# Run in-place (skip worktree creation, use project root directly)
aloop start --in-place --provider claude
```

### Orchestrator Mode (`aloop orchestrate`)

A coordination layer that breaks a spec into GitHub issues with dependency graphs, then dispatches parallel child loops — each in its own git worktree.

1. **Decompose** — Reads one or more spec files (including globs), creates GitHub issues with labels and dependency edges
2. **Dispatch** — Launches child loops per issue, respecting concurrency caps and wave ordering
3. **PR lifecycle** — Squash-merges completed PRs into `agent/trunk` (override with `--trunk`), rebases on conflict, runs agent review gates
4. **Budget tracking** — Aggregates cost across child sessions, pauses at 80% of cap

```bash
# Full orchestration from multiple spec files
aloop orchestrate --spec "SPEC.md specs/*.md" --concurrency 3 --budget 50.00

# Plan only (create issues, don't dispatch)
aloop orchestrate --spec "SPEC.md specs/*.md" --plan-only

# Dispatch specific issues
aloop orchestrate --issues 42,43,44 --concurrency 2

# Merge trunk to main when all issues complete
aloop orchestrate --spec SPEC.md --auto-merge

# Resume a previously stopped orchestrator session
aloop orchestrate --resume <session-id>
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

## Storybook

The dashboard includes a Storybook 10 setup for component development and visual testing.

```bash
cd aloop/cli/dashboard
npm run storybook        # Start on port 6006
npm run build-storybook  # Build static Storybook
```

**Status**: Storybook is configured with Tailwind CSS decorators, dark-mode toggle, and TooltipProvider globals. All components have stories, including layout (`Sidebar`, `MainPanel`, `DocsPanel`, `Header`, `CollapsedSidebar`, `ResponsiveLayout`, `SidebarContextMenu`), session (`ActivityLog`, `ActivityPanel`, `SessionCard`, `SessionDetail`, `SteerInput`, `ArtifactComparisonDialog`, `ArtifactComparisonHeader`, `DiffOverlayView`, `ImageLightbox`, `LogEntryRow`, `LogEntryExpandedDetails`, `SideBySideView`, `SliderView`), shared primitives (`CommandPalette`, `ElapsedTimer`, `PhaseBadge`, `QACoverageBadge`, `StatusDot`), data display (`ArtifactViewer`, `ProviderHealth`, `CostDisplay`), and all `ui/` primitives.

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

## Providers

Five AI coding agents supported — use one, or round-robin across multiple:

| Provider | CLI | Autonomous flag |
|----------|-----|-----------------|
| Claude Code | `claude` | `--dangerously-skip-permissions --print` |
| OpenAI Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` |
| GitHub Copilot | `copilot` | `--yolo` |
| Gemini CLI | `gemini` | `--yolo` |
| OpenCode | `opencode` | `run` (reads prompt from stdin) |

**Round-robin mode** cycles providers each iteration — e.g., Claude plans, Codex builds, Gemini reviews, OpenCode builds.

### Shipped Agents (OpenCode)

When OpenCode is enabled, `aloop setup` installs three specialist agents to `.opencode/agents/`. Invoke them directly with `opencode run --agent <name>`:

| Agent | Description | Model |
|-------|-------------|-------|
| `code-critic` | Deep code review for subtle bugs and security issues | `claude-sonnet-4` (reasoning: xhigh) |
| `error-analyst` | Parses error logs and stack traces to suggest fixes | `gemini-3.1-flash-lite-preview` (reasoning: medium) |
| `vision-reviewer` | Analyzes screenshots for layout and visual issues | `gemini-3.1-flash-lite-preview` (reasoning: medium) |

```bash
# Run the code critic on your working directory
opencode run --agent code-critic

# Analyze error output
opencode run --agent error-analyst

# Review a screenshot for layout issues
opencode run --agent vision-reviewer
```

These agents run as read-only subagents (no write/edit access) via OpenRouter. Customize them by editing the markdown files in `.opencode/agents/`.

Provider health is tracked automatically. Failed providers enter cooldown with exponential backoff and are skipped until recovery. Auth failures use longer cooldowns (10min → 30min → 1hr) but still auto-retry.

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
| `aloop status` | List active sessions and provider health (`--watch` to auto-refresh) |
| `aloop active` | Show only currently running sessions |
| `aloop stop <id>` | Stop a running session |
| `aloop setup` | Interactive project configuration (`--non-interactive` for CI) |
| `aloop scaffold` | Scaffold workspace config files |
| `aloop steer <instruction>` | Send live instruction to a running loop |
| `aloop gh start --issue <n>` | Start a GitHub-linked loop for an issue (creates branch, loop, PR) |
| `aloop gh watch` | Monitor labeled issues and auto-dispatch loops with concurrency queuing |
| `aloop gh status` | Show GH-linked issue/session/PR tracking state |
| `aloop gh stop` | Stop GH-linked loops (--issue \<n\> or --all) |
| `aloop gh <op>` | Policy-enforced GitHub operations (pr-create, pr-comment, pr-merge, etc.) |
| `aloop discover` | Auto-detect project specs and validation |
| `aloop resolve` | Print resolved project config for current directory |
| `aloop process-requests` | Process pending orchestrator request files |
| `aloop update` | Refresh runtime from repo |
| `aloop devcontainer` | Generate .devcontainer config |
| `aloop devcontainer-verify` | Verify devcontainer builds and passes checks |

### `aloop gh` — GitHub-Linked Loops

Run loops directly triggered by GitHub issues, or watch for labeled issues and dispatch automatically:

```bash
# Start a loop for a specific issue (creates branch, runs loop, opens PR)
aloop gh start --issue 42

# Watch for issues labeled "aloop" and auto-dispatch loops (with queuing)
aloop gh watch --label aloop --max-concurrent 3

# Check status of all GH-linked issue/session/PR tracking
aloop gh status

# Stop a specific GH-linked loop or all of them
aloop gh stop --issue 42
aloop gh stop --all
```

Child loops use `aloop gh pr-create`, `aloop gh issue-comment`, etc. for policy-gated GitHub operations (write access is scoped by role).

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
    PROMPT_qa.md                # QA agent template
    PROMPT_proof.md             # Proof agent (finalizer)
    PROMPT_spec-gap.md          # Spec-gap analysis agent (finalizer)
    PROMPT_docs.md              # Documentation sync agent (finalizer)
    PROMPT_spec-review.md       # Spec-review agent (finalizer)
    PROMPT_final-qa.md          # Final QA agent (finalizer)
    PROMPT_final-review.md      # Final review agent (finalizer)
    PROMPT_steer.md             # Steering agent template
    PROMPT_setup.md             # Setup/discovery agent
    PROMPT_single.md            # Single-shot agent template
    PROMPT_merge.md             # PR squash-merge agent (orchestrator)
    PROMPT_orch_scan.md         # Orchestrator scan loop (polls issue/PR state)
    PROMPT_orch_decompose.md    # Epic decomposition (spec → issues)
    PROMPT_orch_sub_decompose.md # Sub-task decomposition within an epic
    PROMPT_orch_planner_fullstack.md  # Fullstack issue planner
    PROMPT_orch_planner_frontend.md   # Frontend issue planner
    PROMPT_orch_planner_backend.md    # Backend issue planner
    PROMPT_orch_planner_infra.md      # Infrastructure issue planner
    PROMPT_orch_arch_analyst.md  # Architecture analysis sub-agent
    PROMPT_orch_product_analyst.md # Product requirements analysis
    PROMPT_orch_estimate.md     # Issue effort estimation
    PROMPT_orch_refine.md       # Issue refinement and acceptance criteria
    PROMPT_orch_replan.md       # Replan after conflict or failure
    PROMPT_orch_review.md       # Orchestrator-level PR review gate
    PROMPT_orch_resolver.md     # Conflict resolution sub-agent
    PROMPT_orch_spec_consistency.md # Cross-issue spec consistency check
    PROMPT_orch_cr_analysis.md  # Change request analysis
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
    pipeline.yml                # Cycle and finalizer config (generated by aloop setup)
    agents/<name>.yml           # Per-agent overrides (prompt, reasoning, timeout)
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
- **Stuck detection**: Auto-skip tasks after N consecutive failures
- **Persistent logs**: RESEARCH.md and REVIEW_LOG.md survive TODO regenerations

## Development

This repo is the development/source location. Edit files here, then run `install.ps1` to deploy, or `aloop update` to refresh the runtime.
