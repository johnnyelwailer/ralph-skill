# Pipeline

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Configurable Agent Pipeline, §Reasoning Effort, §Vision Model (lines ~3428-4090), SPEC-ADDENDUM.md §Prompt Reference Rule, §`aloop start` Unification (pre-decomposition, 2026-04-18).

## Table of contents

- Core concept: agents as the unit
- Subagent delegation (model-per-task)
- Subagent integration into aloop
- Pipeline configuration
- Loop plan compilation (runtime → shell bridge)
- Prompt file format (frontmatter + body)
- Runtime-mutable prompt settings
- Shared instructions via `{{include:path}}`
- Template variable reference
- Event-driven agent dispatch
- Override queue
- Runtime mutation
- Agent-based guarding
- Infinite loop prevention
- Vertical slice verification
- Reasoning effort configuration
- Vision model configuration
- Implementation notes
- `aloop start` as unified entry point

---

## Core concept: agents as the unit

The default `plan → build × 5 → proof → qa → review` cycle is a **configurable, runtime-mutable pipeline of agents**. This cycle is the default configuration, compiled into `loop-plan.json` at session start. Pipelines are fully customizable via agent YAML definitions.

An **agent** is a named unit with:
- **Prompt** — instructions for what the agent does (a `PROMPT_*.md` file or inline)
- **Provider/model preference** (optional) — which harness and model to use (falls back to session default)
- **Reasoning effort** (optional) — controls reasoning depth for models that support it
- **Transition rules** — what happens on success, failure, and repeated failure

Agents are NOT hardcoded. `plan`, `build`, `proof`, `qa`, `review`, `steer` are just the default agents that ship with aloop. Users and the setup agent can define custom agents (e.g., `verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

## Subagent delegation (model-per-task)

A core principle: **agents delegate specialized work to subagents running best-fit models**. The primary agent orchestrates, while subagents execute tasks that require different capabilities (vision, deep reasoning, fast cheap analysis, domain-specific models). This is powered by opencode's native `task` tool, which spawns child sessions with independent model selection.

**How it works in opencode:**

1. Agents are defined in `.opencode/agents/` as markdown files with YAML frontmatter
2. Any agent can invoke the built-in `task` tool targeting another agent by name
3. Each agent declares its own `model` — the child session runs on that model regardless of the parent's model
4. Results flow back to the parent agent's context

**Agent definition format** (`.opencode/agents/<name>.md`):
```yaml
---
description: When to use this agent (required — opencode uses this to suggest delegation)
mode: subagent              # "primary", "subagent", or "all"
model: openrouter/google/gemini-3.1-flash-lite-preview
tools:
  write: false              # restrict tools per agent
  edit: false
  bash: true
temperature: 0.2
maxSteps: 10
---
System prompt for the agent goes here.
Supports {file:path/to/context.md} for file inclusion.
```

**Subagent permission control** — restrict which subagents an agent can invoke:
```json
{
  "agent": {
    "build": {
      "permission": {
        "task": { "*": "deny", "vision-reviewer": "allow", "test-runner": "allow" }
      }
    }
  }
}
```

**Default subagent catalog** — agents that ship with aloop:

| Subagent | Model Selection | Purpose | Used By |
|---|---|---|---|
| `vision-reviewer` | Vision model (Gemini Flash Lite, Seed-2.0-Lite) | Screenshot analysis — layout, whitespace, visual regressions | proof, review |
| `vision-comparator` | Vision model | Baseline vs current screenshot comparison | proof |
| `code-critic` | High-reasoning model (xhigh effort) | Deep code review — subtle bugs, security, edge cases | review |
| `test-writer` | Fast cheap model (medium effort) | Generate test cases from spec/code | build, verify |
| `error-analyst` | Fast cheap model | Parse error logs, stack traces, suggest fixes | build (on failure) |
| `spec-checker` | Reasoning model (high effort) | Verify implementation matches spec acceptance criteria | review |
| `docs-extractor` | Fast cheap model | Extract API docs, type signatures, usage examples from code | docs-generator |
| `security-scanner` | Reasoning model | OWASP top-10 analysis, dependency audit, secret detection | review, guard |
| `accessibility-checker` | Vision model | WCAG compliance check on screenshots | proof, verify |
| `perf-analyzer` | Fast cheap model | Analyze bundle sizes, lighthouse scores, load times | proof |

**Example: review agent delegating to subagents**

The review agent (running on e.g. Claude) encounters a frontend PR. Instead of trying to review everything itself, it delegates:

1. **Structural review** — the review agent itself checks code quality, architecture, spec compliance
2. **Visual review** → delegates to `vision-reviewer` (Gemini Flash Lite) with screenshots
3. **Security scan** → delegates to `security-scanner` (reasoning model with xhigh effort)
4. **Accessibility** → delegates to `accessibility-checker` (vision model) with screenshots
5. **Aggregates results** — the review agent combines all subagent findings into a unified review verdict

**Cost optimization**: Subagent delegation is also a cost strategy. A $2/M output reasoning model should not spend tokens parsing stack traces or generating boilerplate — delegate those to a $0.15/M model and reserve the expensive model for decisions that matter.

## Subagent integration into aloop

Subagent delegation is supported natively by most providers (opencode, claude, copilot, codex) in similar ways. For now, only opencode is implemented — other providers are out of scope but the architecture accommodates them.

**Agent files**: A small set of ready-to-use opencode agent definitions ships with aloop at `aloop/agents/opencode/`:

```
aloop/agents/opencode/
  vision-reviewer.md
  error-analyst.md
  code-critic.md
```

These are static markdown files with hardcoded model references — no templating, no catalog, no compiler. Users can edit models, delete agents they don't want, or add their own.

**Installation**: `aloop setup` copies them into the worktree's `.opencode/agents/` directory when the user has opencode configured as a provider. They get committed in the worktree alongside the code — same as `.vscode/` or `.editorconfig`. The directory is inert for non-opencode providers.

**Conditional prompt injection via `{{SUBAGENT_HINTS}}`**: Loop prompt templates already use provider-specific variables (`{{PROVIDER_HINTS}}`). A new `{{SUBAGENT_HINTS}}` variable is populated only when the current provider supports delegation:

- **opencode** → `SUBAGENT_HINTS` populated with available agents and delegation instructions
- **claude / copilot / codex** → `SUBAGENT_HINTS` set to empty string for now (support planned)

Resolution in `loop.sh`:
```bash
if [[ "$PROVIDER" == "opencode" ]] && [[ -d "$WORKTREE/.opencode/agents" ]]; then
  SUBAGENT_HINTS=$(cat ~/.aloop/templates/subagent-hints-${PHASE}.md)
else
  SUBAGENT_HINTS=""
fi
```

Per-phase hint files list only the subagents relevant to that phase:

```markdown
<!-- subagent-hints-proof.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **vision-reviewer** — analyzes screenshots for layout/visual issues (vision model)
- **accessibility-checker** — WCAG compliance checks on screenshots (vision model)
```

```markdown
<!-- subagent-hints-review.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **code-critic** — deep code review for subtle bugs and security issues (reasoning model)
- **vision-reviewer** — visual review of UI changes (vision model)
```

```markdown
<!-- subagent-hints-build.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **error-analyst** — parse error logs and stack traces, suggest fixes (fast cheap model)
```

This approach is zero config for users (setup copies agents, loop injects hints), provider-agnostic in the prompts, extensible later, and uses no templating engine.

## Pipeline configuration

The pipeline is a sequence of agent references with transition rules:

```yaml
# Example: minimal plan-build-review pipeline (no proof phase)
pipeline:
  - agent: plan
  - agent: build
    repeat: 3
    onFailure: retry       # retry same agent
  - agent: review
    onFailure: goto build   # review fails → back to build

# Example: vertical slice with verification
pipeline:
  - agent: plan
  - agent: build
    repeat: 2
  - agent: verify           # run tests, capture screenshots/video
    onFailure: goto build
    escalation:
      maxRetries: 3
      ladder:
        1: { restrict: code-only }      # first failure: agent can only fix code
        2: { restrict: code-and-tests, requireJustification: true }
        3: { escalateTo: review }        # third failure: second opinion
        4: { flag: human-review }        # give up, flag for human
  - agent: guard             # verify the build agent didn't touch protected files
    onFailure: revert-and-goto build
  - agent: review
  - agent: docs-generator
```

## Loop plan compilation (runtime → shell bridge)

The pipeline YAML config is **not parsed by the shell script**. Instead, the aloop runtime (TS/Bun) compiles it into a simple `loop-plan.json` that the loop scripts can read with zero complexity.

**`loop-plan.json` format:**
```json
{
  "cycle": [
    "PROMPT_plan.md",
    "PROMPT_build.md",
    "PROMPT_build_opencode.md",
    "PROMPT_build_codex.md",
    "PROMPT_build_gemini.md",
    "PROMPT_proof.md",
    "PROMPT_review.md"
  ],
  "cyclePosition": 0,
  "iteration": 1,
  "version": 1
}
```

The cycle is just a list of **prompt filenames**. All agent configuration lives in the prompt file's frontmatter — not in the JSON. This means cycle prompts and queue overrides use the exact same format and the loop parses them identically.

## Prompt file format (frontmatter + body)

Every prompt file — whether in the cycle or the override queue — is a markdown file with YAML frontmatter:

```markdown
---
agent: build
provider: opencode
model: openrouter/openai/gpt-5.1
reasoning: medium
---

# Build Mode

You are Aloop, an autonomous build agent...
```

**Frontmatter fields:**
- `agent` — agent type identifier (plan, build, review, proof, qa, steer, debug, guard, or any custom name)
- `provider` — which CLI to invoke (claude, opencode, codex, gemini, copilot)
- `model` — model ID, provider-specific (e.g., `claude-opus-4-6`, `openrouter/openai/gpt-5.1`, `codex-mini-latest`)
- `reasoning` — reasoning effort level (low, medium, high, xhigh)
- `color` — terminal color for this phase (magenta, yellow, cyan, blue, green, red, white). Default: white
- `trigger` — condition that causes the runtime to queue this agent (e.g., `merge_conflict`, `stuck_detected`). Resolved by the runtime, NOT the loop script. The loop parses and logs this field but never acts on it. Finalizer ordering comes from the compiled `finalizer[]` array, not from trigger chaining.
- `timeout` — per-prompt provider timeout override (duration string like `30m`, `2h`, or integer seconds)
- `max_retries` — per-prompt retry cap before declaring iteration failure (overrides global default for that prompt only)
- `retry_backoff` — per-prompt retry backoff policy (`none`, `linear`, `exponential`)

All fields are optional — defaults apply if omitted (`provider: claude`, `model: claude-opus-4-6`, `agent: build`, `reasoning: medium`).

## Runtime-mutable prompt settings

Prompt frontmatter is re-read on every iteration, so edits to these settings take effect the next time that prompt is selected (cycle or queue):

- `provider`
- `model`
- `reasoning`
- `timeout`
- `max_retries`
- `retry_backoff`
- `color`

Precedence for execution settings is:

1. Prompt frontmatter value (highest)
2. Session/env setting (for example `ALOOP_PROVIDER_TIMEOUT`)
3. Built-in default (lowest)

This applies to both loop mode and orchestrator child loops because both use the same prompt/frontmatter execution path.

## Shared instructions via `{{include:path}}`

Prompt templates support `{{include:path}}` to inline shared instruction files. This avoids duplicating instructions between cycle agents and their finalizer counterparts (e.g., `review` and `final-review` share the same 9-gate instructions).

**How it works:** During template expansion (at session start or queue injection), `{{include:path}}` is replaced with the contents of the referenced file. Paths are relative to `aloop/templates/`.

**Directory structure:**
```
aloop/templates/
  instructions/              # shared instruction blocks
    review.md                # 9 gates, rejection/approval flow, rules
    qa.md                    # test process, isolation rules, cleanup
  PROMPT_plan.md             # cycle agent
  PROMPT_build.md            # cycle agent
  PROMPT_review.md           # cycle agent: frontmatter + {{include:instructions/review.md}}
  PROMPT_qa.md               # cycle agent: frontmatter + {{include:instructions/qa.md}}
  PROMPT_spec-gap.md         # finalizer agent: spec enforcement
  PROMPT_docs.md             # finalizer agent: doc sync
  PROMPT_spec-review.md      # finalizer agent: own instructions
  PROMPT_final-review.md     # finalizer agent: frontmatter + {{include:instructions/review.md}}
  PROMPT_final-qa.md         # finalizer agent: frontmatter + {{include:instructions/qa.md}}
  PROMPT_proof.md            # finalizer agent: own instructions (last step)
  PROMPT_merge.md            # runtime-triggered: conflict resolution (trigger: merge_conflict)
  PROMPT_steer.md            # runtime-triggered: steering
```

**Example — `PROMPT_final-review.md`:**
```yaml
---
agent: final-review
trigger: spec-review
provider: claude
reasoning: high
---

{{include:instructions/review.md}}
```

**Example — `PROMPT_review.md` (cycle version, same instructions, no trigger):**
```yaml
---
agent: review
provider: claude
reasoning: high
---

{{include:instructions/review.md}}
```

The `{{include:path}}` directive is expanded alongside other template variables (`{{SPEC_FILES}}`, `{{REFERENCE_FILES}}`, etc.) during the same expansion pass. Includes can themselves contain template variables — they are expanded after inlining.

## Template variable reference

All template variables used in prompt templates. Variables are expanded at two stages:

**Setup-time** (expanded by `project.mjs` when copying templates to session `prompts/`):

| Variable | Value | Example |
|----------|-------|---------|
| `{{SPEC_FILES}}` | Comma-joined spec file paths from config | `SPEC.md, specs/auth.md` |
| `{{REFERENCE_FILES}}` | Comma-joined reference file paths (RESEARCH.md, VERSIONS.md, etc.) | `RESEARCH.md, VERSIONS.md` |
| `{{VALIDATION_COMMANDS}}` | Bulleted list of backpressure validation commands | `- cd aloop/cli && npm test` |
| `{{SAFETY_RULES}}` | Bulleted list of project-specific safety rules | `- Never modify production database` |
| `{{PROVIDER_HINTS}}` | Provider-specific guidance (e.g., subagent usage for Claude) | `- Claude hint: Use parallel subagents...` |
| `{{include:path}}` | Inlined file contents, relative to `aloop/templates/` | `{{include:instructions/review.md}}` |

**Runtime** (expanded by `loop.sh`/`loop.ps1` before each provider invocation):

| Variable | Value | Example |
|----------|-------|---------|
| `{{ITERATION}}` | Current iteration number | `42` |
| `{{ARTIFACTS_DIR}}` | Session artifacts directory path | `/home/user/.aloop/sessions/abc123/artifacts` |
| `iter-<N>` | Also replaced with current iteration (legacy pattern) | `iter-42` |

**Planned but not yet implemented:**

| Variable | Value | Status |
|----------|-------|--------|
| `{{SUBAGENT_HINTS}}` | Per-phase subagent delegation hints (opencode only) | Spec'd, not yet in expansion code |

**Prompt content rule:** Orchestrator prompts (decompose, gap analysis, estimation, sub-decompose, etc.) must **never embed file contents** in the prompt body. Reference files by path and let the agent read them from the worktree. Queue prompts must only contain: task instructions, file paths to read, output path for results, and contextual metadata (small structured data). Never embed spec content, source code, large JSON payloads, or any content the agent can read from disk. No queue prompt file should exceed 10KB (excluding frontmatter).

## Event-driven agent dispatch

**Principle:** The loop engine is a dumb cycle+finalizer+queue runner. It has ZERO knowledge of what any specific agent does. All it does is:
1. Check the queue — if there's a file, run it, delete it
2. Check if in finalizer mode — if yes, pick next from `finalizer[]`
3. Otherwise pick the next prompt from `cycle[]`
4. Parse frontmatter for provider/model/reasoning config
5. Invoke the provider
6. Advance position (cycle or finalizer)

**The loop handles `allTasksMarkedDone` mechanically** (TODO.md checkbox count) and switches between cycle and finalizer. That's its only "intelligence." Everything else — trigger resolution, steering, stuck detection, custom events — is the **runtime's** job.

**How runtime-driven queue injection works:**

The runtime (shared base library used by dashboard and orchestrator) watches `status.json` and `log.jsonl` to detect conditions, then writes prompt files to `queue/`. The loop picks them up. The runtime handles:

| Condition | Detected By Runtime Via | Action |
|-----------|------------------------|--------|
| Steering requested | STEERING.md file appears | Queue steer prompt + follow-up plan |
| Stuck detected | N consecutive failures in log.jsonl | Queue debug agent via `trigger: stuck_detected` scan |
| Merge conflict | Pre-iteration merge event in log.jsonl | Queue merge agent via `trigger: merge_conflict` scan |
| PR feedback | Orchestrator polls GH PR comments | Queue steer prompt into child's queue |
| Custom events | Agent writes to `requests/*.json` | Runtime processes request, queues follow-up |

**Trigger resolution is the runtime's mechanism** for deciding which prompt to queue for a given condition. The runtime scans prompt catalog for matching `trigger:` frontmatter values. This is useful for extensibility — custom agents can declare `trigger: my_custom_event` and the runtime will queue them when that event occurs.

**The finalizer chain does NOT use triggers.** It's a compiled array in `loop-plan.json` — the loop processes it mechanically. Triggers are only for runtime-driven queue injection (steering, stuck, merge, custom events).

**Examples:**
- Cycle ends, all TODOs done → loop switches to finalizer (no runtime involved) → spec-gap runs, adds 2 TODOs → loop aborts finalizer, resumes cycle
- Cycle ends, all TODOs done → finalizer runs cleanly → proof completes → loop sets `state: completed`
- User runs `aloop steer "focus on tests"` → CLI writes steer prompt directly to queue
- Runtime detects 3 consecutive failures → scans for `trigger: stuck_detected` → queues matching prompt
- Pre-iteration merge conflicts → runtime scans for `trigger: merge_conflict` → queues merge agent

The frontmatter parser extracts agent config from any prompt file, whether from the cycle or the queue. The loop engine itself has no knowledge of what any specific agent does.

## Override queue

`$SESSION_DIR/queue/`:

Queue files use the same frontmatter format as cycle prompts. The loop checks the queue folder before the cycle each iteration — if files exist, it picks the first (sorted), runs it, deletes it.

Files are sorted lexicographically and consumed in order. Naming convention: `NNN-description.md` (e.g., `001-steer.md`, `002-force-review.md`).

**Who writes to the queue:**
- **User** — drops a prompt markdown into `queue/` and it gets picked up next iteration. Works without any runtime.
- **CLI (`aloop steer`)** — writes the user's instruction into a queue file with appropriate frontmatter.
- **Runtime** — injects steering, debugger, merge agent, and other triggered prompts as queue files when it detects conditions via `status.json`/`log.jsonl` polling. Uses `trigger:` frontmatter to find matching prompts.

**Key properties:**
- The `cycle` array is a **short repeating pattern** of prompt filenames (typically 5-7 entries), NOT an unrolled list of all iterations. The loop script wraps around with `% length`.
- `cyclePosition` and `iteration` live in the plan file — the runtime and shell share state through this single file. The shell updates position after each iteration; the runtime reads it when deciding mutations.
- The runtime compiles this file once at session start from the pipeline YAML config, then **rewrites it** whenever the pipeline mutates (failure recovery, agent injection). It preserves `cyclePosition` and `iteration` (or adjusts them if the mutation requires it, e.g., `goto build` resets `cyclePosition`).
- The loop script re-reads the file every iteration, so mutations take effect on the next turn.
- The `version` field increments on each runtime rewrite — the loop script logs when it detects a plan change.
- To change an agent's provider/model/reasoning/timeout/retry behavior, edit its prompt file's frontmatter — no plan recompilation needed. Changes take effect on the next iteration that uses that prompt.
- Transition rules (`onFailure: goto build`, escalation ladders) are **resolved by the runtime**, not the shell. When the runtime observes a failure via `status.json`, it rewrites the plan accordingly.
- This keeps all complex logic in TS/Bun and all shell logic trivial: read JSON for cycle index, parse frontmatter for config, check queue folder, invoke, update index.

**When the runtime modifies the plan:**
- Agent failure detected (via `status.json` polling) → apply `onFailure` transition rules (write queue entry or adjust `cyclePosition`)
- Escalation threshold reached → write recovery agent to queue, or inject into `cycle` if permanent
- Host monitor detects repeated failures → swap provider in prompt frontmatter or write debugger to queue

## Runtime mutation

The pipeline is **mutable at runtime** via two mechanisms:

**Override queue** (`$SESSION_DIR/queue/`):
- User drops steering prompt → loop picks it up next iteration, runs it, deletes it
- Runtime detects all tasks done → writes `queue/NNN-review.md` with review agent frontmatter
- Repeated build failures → writes `queue/NNN-debug.md` with debugger agent frontmatter
- Queue items do NOT modify the `cycle` array — they interrupt it without advancing `cyclePosition`
- The loop handles this autonomously — no runtime required for basic steering

**Permanent pipeline changes** (via rewriting `loop-plan.json` and/or prompt files):
- User steering says "add `security-audit` after every `build`" → runtime adds the prompt file and inserts its filename into the `cycle` array
- User steering says "remove `docs-generator`" → runtime removes it from the `cycle` array
- Provider consistently timing out → runtime edits that prompt file's frontmatter to swap providers
- To change model/reasoning/timeout/max_retries/retry_backoff for an agent -> edit the prompt file's frontmatter (no plan rewrite needed)

Agents do **not** modify the pipeline themselves — control stays with the user and host-side monitor (avoids perverse incentives like agents removing their own reviewers).

## Agent-based guarding

Instead of structural file-permission enforcement, a **guard agent** reviews what the previous agent changed and rejects unauthorized modifications:

- Runs after the build agent (or any agent that needs policing)
- Checks `git diff` for the agent's iteration
- Reverts changes to protected files (e.g., test expectations, config, spec) and sends the build agent back with a rejection message
- The guard agent's own prompt defines what's protected — configurable per project
- Guard agent is itself guarded by being unable to modify code (it can only revert and reject)

This is preferable to hardcoded file-permission enforcement because:
- The guard can make judgment calls (e.g., "this test change is legitimate because the API contract changed")
- Protection rules are configurable per project, not baked into loop machinery
- It follows the same agent model — no special-case infrastructure

## Infinite loop prevention

With a flexible agent pipeline where agents can modify files that trigger other agents, infinite loops are easy to create accidentally. Two mechanisms prevent this:

**1. Provenance tagging**

Every agent commit includes a provenance trailer:
```
Aloop-Agent: spec-consistency
Aloop-Iteration: 14
Aloop-Session: ralph-skill-20260314-173930
```

The runtime's file-change watcher reads provenance before triggering follow-up agents:
- Housekeeping agents (spec-consistency, spec-backfill, guard) never re-trigger themselves
- An agent's output does not re-trigger the same agent type unless explicitly configured
- Only commits without aloop provenance (human edits) or from substantive agents (build, plan) trigger the full reactive pipeline

**2. Loop health supervisor agent**

A lightweight supervisor agent (`PROMPT_loop_health.md`) runs every N iterations (configurable, default: every 5) as part of the normal cycle. It reads `log.jsonl` and detects unhealthy patterns:

- **Repetitive agent cycling** — same agent type running repeatedly without progress (e.g., spec-consistency triggered 4 times in 6 iterations)
- **Queue thrashing** — queue depth growing instead of draining, or same prompts being re-queued
- **Stuck cascades** — agent A triggers B triggers A triggers B with no net progress
- **Wasted iterations** — agents running but producing no meaningful commits or changes
- **Resource burn** — disproportionate token/iteration spend on non-build agents

When the supervisor detects an unhealthy pattern, it can:
- **Trip a circuit breaker** — suspend the offending agent type by removing it from the cycle or blocking its queue entries, with a log entry explaining why
- **Alert the user** — create an `aloop/health-alert` issue or post a comment describing the pattern
- **Adjust the pipeline** — write a request to reduce trigger sensitivity or increase cooldowns

The supervisor is itself provenance-tagged and excluded from re-triggering — it cannot cause the loops it's designed to prevent.

## Vertical slice verification

For greenfield projects, the orchestrator decomposes the spec into **vertical slices** (each a GH issue/PR). Each slice is an independently runnable end-to-end path, not a horizontal layer.

**Slice definition of done** (enforced by the pipeline):
- Code is complete (build agent)
- Builds and runs independently (verify agent)
- Happy path works end-to-end with Playwright (verify agent — screenshots + video capture)
- Tested with both fake/mock data and real/E2E data where applicable (verify agent)
- No dead UI or stubs — the slice feels complete for what it covers (review agent)
- Dependencies on other slices are explicit (plan agent)
- Setup is bootstrapped — seed data, docker-compose, env vars included (build agent)
- Getting-started docs generated (docs-generator agent)

**Self-healing verification loop:**
The verify agent runs Playwright tests, captures screenshots and video. On failure, it feeds the evidence (failure screenshot, error log, video of broken flow) back to the build agent. The escalation ladder controls what the build agent is allowed to fix:

| Attempt | Agent may change | Requirement |
|---|---|---|
| 1st failure | Code only | Tests are treated as the spec |
| 2nd failure | Code + tests | Must justify why the test was wrong |
| 3rd failure | Escalated to review agent | Independent assessment: code vs test bug |
| 4th failure | Flagged for human | Loop stops on this slice, continues others |

Test expectations ideally originate from the **plan agent** (derived from the slice spec), not the build agent — so the build agent is implementing to a contract it didn't write.

The verify agent itself delegates visual comparison to subagents — it captures screenshots via Playwright, then delegates to `vision-comparator` (vision model) for baseline diffing and to `accessibility-checker` for WCAG compliance. This means the verify agent can run on a cheap text model while getting vision-quality analysis via delegation.

## Reasoning effort configuration

Reasoning models (OpenAI GPT-5 series, Grok, and via proxy Anthropic/Gemini) support configurable reasoning depth. Different agents benefit from different reasoning effort levels — a review agent should think harder than a build agent.

**OpenAI reasoning effort levels** (from the Responses API):

| Level | Token allocation | Use case |
|-------|-----------------|----------|
| `none` | Disabled | Non-reasoning tasks |
| `minimal` | ~10% of max_tokens | Trivial operations |
| `low` | ~20% | Simple tasks |
| `medium` | ~50% (default) | Balanced speed/quality |
| `high` | ~80% | Complex analysis |
| `xhigh` | ~95% | Maximum reasoning depth |

- `xhigh` is supported on models after `gpt-5.1-codex-max`
- `gpt-5.1` defaults to `none`; models before `gpt-5.1` default to `medium`
- `gpt-5-pro` defaults to and only supports `high`
- Source: https://developers.openai.com/api/reference/resources/responses/methods/create

**Agent-level configuration** in pipeline YAML:

```yaml
# .aloop/agents/plan.yml
agent: plan
prompt: PROMPT_plan.md
reasoning:
  effort: high          # deep gap analysis needs thorough reasoning

# .aloop/agents/build.yml
agent: build
prompt: PROMPT_build.md
reasoning:
  effort: medium        # speed matters for implementation

# .aloop/agents/review.yml
agent: review
prompt: PROMPT_review.md
reasoning:
  effort: xhigh         # thorough quality gate, catch subtle bugs

# .aloop/agents/proof.yml
agent: proof
prompt: PROMPT_proof.md
reasoning:
  effort: medium        # artifact generation, not heavy reasoning
```

**Recommended defaults** (when no per-agent config exists):

| Agent | Default effort | Rationale |
|-------|---------------|-----------|
| plan | `high` | Gap analysis, spec comparison |
| build | `medium` | Implementation speed |
| review | `xhigh` | Catch subtle quality issues |
| proof | `medium` | Artifact generation |
| steer | `medium` | Spec/TODO updates |

**OpenRouter as unified proxy**: OpenRouter normalizes reasoning config across providers via its `reasoning` parameter. `effort` works natively for OpenAI/Grok models; for Anthropic/Gemini models it maps to `max_tokens`. This means the same agent config works regardless of which provider the round-robin selects — the loop passes `reasoning.effort` and OpenRouter translates.

```json
// OpenRouter reasoning parameter (in API request body)
{
  "reasoning": {
    "effort": "xhigh",       // OpenAI-style (string enum)
    "max_tokens": 32000,     // Anthropic-style (token count) — alternative to effort
    "exclude": false          // whether to exclude reasoning tokens from response
  }
}
```

Source: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

**Provider-specific pass-through**: When using opencode CLI, reasoning effort maps to the `--variant` flag. When using providers directly (via OpenRouter or native APIs), the reasoning config is passed in the request body.

## Vision model configuration

The proof and review phases can use vision-capable models for automated UI review — analyzing screenshots for layout issues, whitespace problems, spatial relationships, and visual regressions. This requires models that accept image input.

**Configuring vision models in opencode**: Models not in opencode's built-in registry need their modalities declared in `opencode.json` so opencode knows to send images as vision payloads:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "models": {
        "bytedance-seed/seed-2.0-lite": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "bytedance-seed/seed-2.0-mini": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "qwen/qwen3.5-9b": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

Without the `modalities` declaration, opencode defaults to `"image": false` for custom-registered models, and image attachments are passed as tool-call file reads instead of vision payloads — resulting in "this model does not support image input" errors even when the model does support vision via its provider API.

Models already in opencode's built-in registry (e.g., `google/gemini-3.1-flash-lite-preview`) have capabilities auto-populated from the [models.dev](https://models.dev) catalog and need no extra config.

**Headless image attachment**: In non-interactive `opencode run` mode, images are attached via the `-f` flag:
```bash
opencode run -m openrouter/google/gemini-3.1-flash-lite-preview \
  -f screenshot.png -- "Analyze this UI screenshot..."
```

**Vision model comparison** (tested on 1920x1080 dashboard screenshot, spatial analysis prompt):

| Model | Cost (input) | Spatial Quality | Notes |
|---|---|---|---|
| Seed-2.0-Lite | $0.25/M | Excellent — precise %, identified whitespace severity | Best structured output, no hallucinations |
| Seed-2.0-Mini | $0.10/M | Very good — per-element padding estimates | Minor math error in one coordinate |
| Gemini 3.1 Flash Lite | $0.25/M | Good — clean table format, correct proportions | Has ZDR via Google Vertex AI |
| Qwen3.5-9B | $0.05/M | Good — correct structure, reasonable estimates | Cheapest option |
| gpt-5-nano | free | Decent — correct proportions, less granular | Good baseline |
| nemotron-nano-vl | free | Moderate | Hallucinated non-existent UI elements |

**Important caveats**:
- Pixel size estimates **drift significantly** across models — no model produces reliable absolute pixel measurements. Treat estimates as directional (relative proportions and "too much/too little whitespace") rather than precise pixel values.
- "Stealth" or test models (e.g., models from unknown providers marked as free/testing) may collect all input data. Do not use them for production workloads with sensitive UI content.

**ZDR (Zero Data Retention) for vision**: Key caveat for vision — **OpenAI's ZDR explicitly excludes image inputs.** For production visual review with sensitive content, use Anthropic Claude (direct API with org ZDR), AWS Bedrock (default no-retention), or Gemini via Vertex AI (project-level ZDR).

## Implementation notes

- Pipeline config lives in `.aloop/pipeline.yml` (or inline in `config.yml`) — this is the **source of truth**
- `loop-plan.json` is a **compiled artifact** — never hand-edit it, always regenerate from config
- The relationship is like TypeScript → JavaScript: you edit the source, the compiler produces the runtime artifact
- Default pipeline (plan → build × 5 → proof → qa → review) is generated if no config exists — backward compatible
- Agent definitions live in `.aloop/agents/` — each is a YAML file with prompt reference, provider preference, reasoning effort, and transition rules
- The loop script becomes a generic agent runner: read `loop-plan.json`, resolve next agent, invoke, repeat
- Runtime pipeline mutations are applied via the host-side monitor rewriting `loop-plan.json`
- Pipeline state (`cyclePosition`, `iteration`, `version`, escalation counts, mutation history) lives in `loop-plan.json` itself
- The parallel orchestrator creates per-slice pipelines — each child loop runs its own `loop-plan.json` independently

---

## `aloop start` as unified entry point

`aloop start` must be the single entry point for all session types. Users should not need to know whether to run `aloop start` or `aloop orchestrate` — the CLI reads the project config and dispatches accordingly.

### Required behavior

```
aloop start              # reads project config → dispatches to loop or orchestrate
aloop start --mode loop  # explicit override → loop mode regardless of config
aloop orchestrate        # still works directly (power-user / CI shortcut)
```

**Dispatch logic in `start`:**

1. Read `mode` from project config (`~/.aloop/projects/<hash>/config.yml`)
2. If `mode === 'orchestrate'`:
   - Forward to `aloop orchestrate` with translated flags (spec files, concurrency, etc. from config)
   - Pass through any CLI overrides (`--concurrency`, `--spec`, `--trunk`, etc.)
3. If `mode` is a loop mode (`plan-build-review`, `single`, etc.):
   - Run existing loop start logic (unchanged)
4. `--mode` flag on `start` overrides the config value

**Flag mapping (`start` → `orchestrate`):**

| `aloop start` flag | `aloop orchestrate` equivalent |
|---------------------|-------------------------------|
| `--provider` | Passed through (provider selection) |
| `--max` | `--max-iterations` (but omitted by default in orchestrate mode) |
| `--in-place` | N/A (orchestrate always uses worktrees per child) |
| `--launch resume` | `--resume` (reconstruct state from GitHub) |

**Skill prompt update:** The `/aloop:start` skill prompt must not hardcode `aloop start` — it should work identically for both modes since the CLI handles dispatch.

### CLI simplification

**User-facing commands (6):**

| Command | Purpose |
|---------|---------|
| `aloop setup` | Interactive project setup |
| `aloop start` | Start any session (loop or orchestrate — auto-dispatched from config) |
| `aloop status` | Show sessions and health |
| `aloop steer <msg>` | Send steering instruction |
| `aloop stop <id>` | Stop a session |
| `aloop dashboard` | Launch monitoring UI |

**Internal/plumbing commands (hidden from `--help` by default):**

| Command | Purpose | Called by |
|---------|---------|----------|
| `resolve` | Resolve project workspace | `setup`, `start` |
| `discover` | Discover specs and files | `setup` |
| `scaffold` | Scaffold prompts and config | `setup`, `start` |
| `orchestrate` | Orchestrator entry point | `start` (when mode=orchestrate) |
| `gh` | GitHub operations proxy | Loop runtime (requests) |
| `update` | Refresh runtime assets | Manual maintenance |
| `devcontainer` | Generate devcontainer config | `setup`, `start` |
| `active` | List active sessions | `status` (subset) |

**Key changes:**
- `orchestrate` becomes a hidden command — `start` dispatches to it automatically
- `active` is redundant with `status` — fold into `status` or hide
- `resolve`, `discover`, `scaffold` are never user-facing — hide from default `--help`
- Default `--help` shows only the 6 user-facing commands
- `aloop --help --all` or `aloop --help-all` shows everything (for debugging/development)

This does NOT change any implementation — all commands still exist and work. It only changes what's shown in `--help` and what users need to learn.
