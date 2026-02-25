---
name: aloop
description: Aloop autonomous coding methodology — plan-build-review loops with multi-provider support, backpressure validation, and stuck detection. Background knowledge for AI-powered iterative development.
---

<essential_principles>
## What is Aloop?

Aloop is Geoffrey Huntley's autonomous AI coding methodology that uses iterative loops with task selection, execution, and validation. In its purest form, it's a Bash loop:

```bash
while :; do cat PROMPT.md | claude ; done
```

The loop feeds a prompt file to an AI coding agent, the agent completes one task, updates the implementation plan, commits changes, then exits. The loop restarts immediately with fresh context.

### Core Philosophy

**The Aloop Wiggum Technique is deterministically bad in an undeterministic world.** Aloop solves context accumulation by starting each iteration with fresh context — the core insight behind Geoffrey's approach.

### The Cycle: Plan, Build x3, Review

Each cycle runs 5 iterations: one plan, three builds, one review. This ratio gives Aloop enough build momentum to make real progress between planning and critique phases.

1. **Planning Phase** (1x): Gap analysis (specs vs code) outputs prioritized TODO list — no implementation, no commits
2. **Building Phase** (3x): Picks tasks from plan, implements, runs tests (backpressure), commits — three consecutive iterations for real progress
3. **Review Phase** (1x): Critically audits the build iterations against 5 quality gates — the adversarial critic that catches shallow tests, spec deviations, and coverage gaps
4. **Observation Phase** (yours): You sit on the loop, not in it — engineer the setup and environment that allows Aloop to succeed

### Key Principles

**Your Role**: Aloop does all the work, including deciding which planned work to implement next and how to implement it. Your job is to engineer the environment.

**Backpressure**: Create backpressure via tests, typechecks, lints, builds that reject invalid/unacceptable work.

**Observation**: Watch, especially early on. Prompts evolve through observed failure patterns.

**Context Efficiency**: With ~176K usable tokens from 200K window, allocating 40-60% to "smart zone" means tight tasks with one task per loop achieves maximum context utilization.

**File I/O as State**: The plan file persists between isolated loop executions, serving as deterministic shared state — no sophisticated orchestration needed.

**Persistent Research Log**: The planner appends discoveries to `RESEARCH.md` in the work directory (append-only, timestamped). Each planning iteration reads it first to avoid re-researching things already investigated. The file survives TODO.md regenerations and spec updates.

**Multi-Provider**: Aloop supports claude, codex, gemini, and copilot as providers. Round-robin mode cycles through providers each iteration for diversity.

**Stuck Detection**: When Aloop fails on the same task N times in a row, the task is automatically marked as blocked and skipped so the loop can continue making progress.

**Live Steering**: While the loop runs, you can redirect it mid-flight without stopping it. Use `/$skillName:steer` to tell the host agent what to change — it interviews you, reads current loop state, and drops a structured `STEERING.md` (with commit SHA + timestamp) into the session directory. At the next iteration boundary the loop detects it, invokes a spec-update agent that applies the changes to specs and TODO.md, then forces a re-plan before resuming normal cycles.

**Worktree Isolation**: By default, Aloop loops run on a separate git worktree to keep your main branch clean while development progresses.
</essential_principles>

<infrastructure>
## Aloop Infrastructure

All Aloop runtime state lives in `~/.aloop/`, not in your project repository:

- `~/.aloop/config.yml` — Global defaults (provider, model, modes)
- `~/.aloop/bin/loop.ps1` / `loop.sh` — Loop scripts
- `~/.aloop/templates/` — Base prompt templates with `{{variables}}`
- `~/.aloop/projects/<hash>/` — Per-project configuration
- `~/.aloop/sessions/<id>/` — Per-session state, logs, and reports
- `~/.aloop/active.json` — Registry of running sessions

Use `/$skillName:setup` to configure a project, `/$skillName:start` to launch a loop, `/$skillName:status` to check progress, and `/$skillName:stop` to end a loop.
</infrastructure>

<reference_index>
## Domain Knowledge

All in `references/`:

**Core Concepts:** aloop-fundamentals.md — Three phases, fresh context, file I/O as state
**Prompts:** prompt-design.md — Planning vs building vs review mode instructions
**Backpressure:** validation-strategy.md — Tests, lints, builds as steering
**Best Practices:** operational-learnings.md — AGENTS.md guidance and evolution
</reference_index>

<success_criteria>
Skill is successful when:
- User understands Aloop methodology (plan-build-review loop)
- User can configure and run Aloop loops via /$skillName commands
- User knows where Aloop state lives (~/.aloop/)
- User understands backpressure, stuck detection, and observation roles
</success_criteria>
