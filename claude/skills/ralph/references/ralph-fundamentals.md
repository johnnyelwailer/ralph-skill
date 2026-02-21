# Ralph Fundamentals

Core concepts and philosophy of Geoffrey Huntley's Ralph Wiggum autonomous coding technique.

<what_is_ralph>
## What is Ralph?

Ralph is an autonomous AI coding methodology created by Geoffrey Huntley that went viral in late 2025. In its purest form, it's a Bash loop:

```bash
while :; do cat PROMPT.md | claude ; done
```

The loop continuously feeds a prompt file to an AI coding CLI. The agent completes one task, updates the implementation plan on disk, commits changes, then exits. The loop restarts immediately with fresh context.

**The core insight:** Ralph solves context accumulation by starting each iteration with fresh context. This is "deterministically bad in an undeterministic world" — embracing the chaos rather than fighting it.
</what_is_ralph>

<three_phases>
## The Cycle: Plan, Build x3, Review

Ralph uses three distinct operational modes that cycle in a 5-step pattern (plan → build → build → build → review). The 1:3:1 ratio ensures real build progress between planning and review phases:

### Phase 1: Planning Mode

**Objective:** Gap analysis only
**Input:** Specs and existing code
**Output:** `TODO.md` (prioritized task list)
**Rule:** No implementation, no commits

The planning prompt instructs the agent to:
1. Study all specification files
2. Study existing source code
3. Compare specs against implementation
4. Generate or update `TODO.md`
5. Exit

**Critical instruction:** "Don't assume not implemented; confirm with code search first."

### Phase 2: Building Mode

**Objective:** Implement from the plan
**Input:** Plan, specs, existing code
**Output:** Code changes + commits
**Rule:** One task per loop iteration

The building prompt instructs the agent to:
1. Study the implementation plan
2. Select most important task (or `[review]` tasks first)
3. Search existing code (don't assume anything is missing)
4. Implement the functionality
5. Run validation (tests, type checks, lints)
6. Update the plan with findings
7. Commit with descriptive message
8. Exit

### Phase 3: Review Mode

**Objective:** Adversarial audit of the last build
**Input:** Recent git changes, specs, plan
**Output:** `[review]` tasks for failures, or approval notes for passes
**Rule:** Never implement code — only critique

The review prompt instructs the agent to:
1. Identify files changed in the last build commit(s)
2. Audit every changed file against 5 quality gates
3. Write specific, actionable `[review]` fix tasks for failures
4. Add approval notes with concrete observations for passes
5. Exit

**The 5 Gates:**
1. **Spec Compliance** — Does code match spec intent?
2. **Test Depth** — No shallow fakes (toBeDefined, toBeTruthy, shape-only checks)
3. **Coverage** — >=80% branch coverage for touched files
4. **Code Quality** — No dead code, duplication, or over-engineering
5. **Integration Sanity** — No regressions, validation passes

### Observation Phase (Your Role)

**Objective:** Sit on the loop, not in it
**Action:** Engineer the environment that allows Ralph to succeed

You:
- Watch for failure patterns
- Tune prompts based on observed behavior
- Add backpressure mechanisms
- Improve specs when Ralph misunderstands

You DON'T:
- Jump into the loop to fix things
- Manually implement features
- Edit code directly
</three_phases>

<multi_provider>
## Multi-Provider Support

Ralph supports four AI coding providers:

| Provider | CLI | Autonomous Flag | Model Selection |
|----------|-----|-----------------|-----------------|
| Claude | `claude` | `--dangerously-skip-permissions --print` | `--model opus` |
| Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` | `-m gpt-5.3-codex` |
| Gemini | `gemini` | `--yolo` | `-m gemini-3-pro-preview` |
| Copilot | `copilot` | `--yolo` | `--model gpt-5.3-codex` |

### Round-Robin Mode

Cycle through providers each iteration for diversity:
- Iteration 1: claude (plan)
- Iteration 2: codex (build)
- Iteration 3: gemini (review)
- Iteration 4: copilot (plan)
- ...

Each provider brings different strengths — round-robin leverages the ensemble.

### Provider Retry/Fallback

When a provider fails:
- **Copilot**: tries primary model → retry model → no explicit model
- **Gemini**: tries explicit model → no explicit model
- **Claude/Codex**: fail immediately (no fallback)
</multi_provider>

<stuck_detection>
## Stuck Detection

When Ralph fails on the same task N consecutive times (default: 3), the task is automatically:
1. Marked as `[S]` (skipped) in the plan
2. Added to a `## Blocked` section with the reason
3. Loop continues with the next task

This prevents infinite loops on hard tasks. You can:
- Fix the underlying issue and re-add the task later
- Increase the stuck threshold (`--max-stuck 5`)
- Improve specs or add guidance for the stuck area
</stuck_detection>

<core_principles>
## Core Principles

### 1. Fresh Context Every Iteration
Each loop starts with a clean context window. No accumulated conversation history, no stale assumptions.

### 2. File I/O as State
`TODO.md` is the only state that persists across iterations. This serves as deterministic shared state.

### 3. Backpressure as Steering
Tests, type checks, lints, and builds provide downstream steering. If Ralph's code doesn't pass validation, the loop continues until it does.

### 4. Context Efficiency
200K advertised tokens ~ 176K usable tokens. One task per loop = maximum context utilization.

### 5. Prompts as Signs
Prompts evolve through observed failure patterns. Start minimal, add guidance only when needed.

### 6. Let Ralph Ralph
Trust the LLM's ability. Don't micromanage. Observe and course-correct reactively.
</core_principles>

<when_to_regenerate_plan>
## When to Regenerate Plan

Discard `TODO.md` and restart planning when:
- Ralph implements wrong things or duplicates work
- Plan feels stale or mismatched to current state
- Significant spec changes made
- Confusion about actual completion status

**Cost-benefit:** One planning loop iteration is cheaper than Ralph circling on bad assumptions.
</when_to_regenerate_plan>
