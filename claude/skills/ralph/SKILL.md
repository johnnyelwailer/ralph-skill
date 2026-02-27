---
name: ralph
description: Ralph autonomous coding methodology — plan-build-review loops with multi-provider support, backpressure validation, and stuck detection. Background knowledge for AI-powered iterative development.
---

<essential_principles>
## What is Ralph?

Ralph is Geoffrey Huntley's autonomous AI coding methodology that uses iterative loops with task selection, execution, and validation. In its purest form, it's a Bash loop:

```bash
while :; do cat PROMPT.md | claude ; done
```

The loop feeds a prompt file to an AI coding agent, the agent completes one task, updates the implementation plan, commits changes, then exits. The loop restarts immediately with fresh context.

### Core Philosophy

**The Ralph Wiggum Technique is deterministically bad in an undeterministic world.** Ralph solves context accumulation by starting each iteration with fresh context — the core insight behind Geoffrey's approach.

### The Cycle: Plan, Build x3, Review

Each cycle runs 5 iterations: one plan, three builds, one review. This ratio gives Ralph enough build momentum to make real progress between planning and critique phases.

1. **Planning Phase** (1x): Gap analysis (specs vs code) outputs prioritized TODO list — no implementation, no commits
2. **Building Phase** (3x): Picks tasks from plan, implements, runs tests (backpressure), commits — three consecutive iterations for real progress
3. **Review Phase** (1x): Critically audits the build iterations against 5 quality gates — the adversarial critic that catches shallow tests, spec deviations, and coverage gaps
4. **Observation Phase** (yours): You sit on the loop, not in it — engineer the setup and environment that allows Ralph to succeed

### Key Principles

**Your Role**: Ralph does all the work, including deciding which planned work to implement next and how to implement it. Your job is to engineer the environment.

**Backpressure**: Create backpressure via tests, typechecks, lints, builds that reject invalid/unacceptable work.

**Observation**: Watch, especially early on. Prompts evolve through observed failure patterns.

**Context Efficiency**: With ~176K usable tokens from 200K window, allocating 40-60% to "smart zone" means tight tasks with one task per loop achieves maximum context utilization.

**File I/O as State**: The plan file persists between isolated loop executions, serving as deterministic shared state — no sophisticated orchestration needed.

**Persistent Research Log**: The planner appends discoveries to `RESEARCH.md` in the work directory (append-only, timestamped). Each planning iteration reads it first to avoid re-researching things already investigated. The file survives TODO.md regenerations and spec updates.

**Multi-Provider**: Ralph supports claude, codex, gemini, and copilot as providers. Round-robin mode cycles through providers each iteration for diversity.

**Stuck Detection**: When Ralph fails on the same task N times in a row, the task is automatically marked as blocked and skipped so the loop can continue making progress.

**Live Steering**: While the loop runs, you can redirect it mid-flight without stopping it. Use `/ralph:steer` to tell the host agent what to change — it interviews you, reads current loop state, and drops a structured `STEERING.md` (with commit SHA + timestamp) into the session directory. At the next iteration boundary the loop detects it, invokes a spec-update agent that applies the changes to specs and TODO.md, then forces a re-plan before resuming normal cycles.

**Worktree Isolation**: By default, Ralph loops run on a separate git worktree to keep your main branch clean while development progresses.
</essential_principles>

<infrastructure>
## Ralph Infrastructure

All Ralph runtime state lives in `~/.ralph/`, not in your project repository:

- `~/.ralph/config.yml` — Global defaults (provider, model, modes)
- `~/.ralph/bin/loop.ps1` / `loop.sh` — Loop scripts
- `~/.ralph/templates/` — Base prompt templates with `{{variables}}`
- `~/.ralph/projects/<hash>/` — Per-project configuration
- `~/.ralph/sessions/<id>/` — Per-session state, logs, and reports
- `~/.ralph/active.json` — Registry of running sessions

Use `/ralph:setup` to configure a project, `/ralph:start` to launch a loop, `/ralph:status` to check progress, and `/ralph:stop` to end a loop.
</infrastructure>

<orchestration_playbook>
## Orchestration Playbook (Critical)

When Ralph is run by another agent/tooling layer, orchestration quality determines whether loops make progress or silently die.

1. **Use a persistent execution channel for long runs.**
   - Prefer a PTY/session model for `loop.sh`/`loop.ps1`.
   - Do not assume detached/background children survive after a one-shot command wrapper exits.
2. **Default to no provider timeout for real loops.**
   - Use `RALPH_PROVIDER_TIMEOUT=0` (or `--provider-timeout 0`) unless you explicitly want enforced cutoff behavior.
3. **Track liveness with both process and artifact signals.**
   - Process signal: loop process exists plus active provider child process (`claude`, `codex`, etc.).
   - Artifact signal: `status.json` `updated_at` advances, `log.jsonl` gains events, and `log.jsonl.raw` grows.
4. **Treat stale `running` sessions as dead when process is gone.**
   - If `status.json` still says `state=running` but no loop/provider process exists and file mtimes are stale, consider the run crashed/terminated.
   - In this case, cleanup hooks may not have executed, so `report.md` may be missing.
5. **Use a recovery-first restart protocol.**
   - Start a new session id; keep old session artifacts for forensics.
   - If first iteration repeatedly hangs, run a short foreground/debug iteration to capture concrete failure text before restarting the full loop.
6. **Be explicit with provider strategy.**
   - For diversity: `--provider round-robin --round-robin claude,codex` (or your chosen list).
   - If one provider is unstable in current context, temporarily pin provider rather than burning iterations.
</orchestration_playbook>

<reference_index>
## Domain Knowledge

All in `references/`:

**Core Concepts:** ralph-fundamentals.md — Three phases, fresh context, file I/O as state
**Prompts:** prompt-design.md — Planning vs building vs review mode instructions
**Backpressure:** validation-strategy.md — Tests, lints, builds as steering
**Best Practices:** operational-learnings.md — AGENTS.md guidance and evolution
</reference_index>

<success_criteria>
Skill is successful when:
- User understands Ralph methodology (plan-build-review loop)
- User can configure and run Ralph loops via /ralph commands
- User knows where Ralph state lives (~/.ralph/)
- User understands backpressure, stuck detection, and observation roles
</success_criteria>
