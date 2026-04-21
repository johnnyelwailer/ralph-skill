# Pipeline

> **Reference document.** The agent pipeline model: how workflows are authored, compiled, executed, and mutated. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Configurable Agent Pipeline, §Reasoning Effort, §Vision Model; SPEC-ADDENDUM.md §Prompt Reference Rule, §`aloop start` Unification; CRs #287 (chain grammar), #135 (agent CLI), #94 (data-driven), #191 (compile step).

## Table of contents

- Core concept: agents as the unit
- Workflow vs pipeline vs loop-plan
- Prompt file format (frontmatter + body)
- Chain grammar in frontmatter
- Shared instructions via `{{include:path}}`
- Template variable reference
- Compile step: pipeline.yml → loop-plan.json
- Event-driven dispatch (trigger + queue)
- Scheduler permit hook
- Runtime mutation
- Agent contract
- Orchestrator as a workflow
- Child loops as workflows
- Subagent delegation
- Reasoning effort
- Vision models
- `aloop start` as unified entry point

---

## Core concept: agents as the unit

An **agent** is a named unit with a prompt, an optional provider/model preference, an optional reasoning effort, and an optional trigger. Agents are data, not code.

A **pipeline** is an authored sequence of agents with transition rules (`repeat`, `onFailure`). The default is `plan → build × 5 → proof → qa → review`, but this is just one possible pipeline — projects author their own.

A **workflow** is any pipeline configuration intended for a session: plan-build-review, review-only, orchestrator-scan-dispatch, etc. Every workflow is just a pipeline + some metadata.

Agents are **not hardcoded**. `plan`, `build`, `proof`, `qa`, `review` are bundled defaults. Projects can define any named agent (`verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

## Workflow vs pipeline vs loop-plan

Three artifacts, compiled in order:

| Artifact | Authored by | Consumed by | Lifetime |
|---|---|---|---|
| `pipeline.yml` (project) | User / setup | Compile step | Edit-at-will; re-compiles on change |
| `loop-plan.json` (session) | Compile step | Daemon + shell shim | Per session; rewritten on mutations |
| Live session state | Daemon | Clients (CLI, dashboard) | Per session; in SQLite + JSONL |

The shell shim and the daemon **only** consume `loop-plan.json` and prompt files. Neither parses YAML. The compile step is the one place YAML gets interpreted.

### pipeline.yml (source of truth)

```yaml
pipeline:
  - agent: plan
  - agent: build
    repeat: 5
    onFailure: retry
  - agent: qa
  - agent: review
    onFailure: goto build

finalizer:
  - PROMPT_spec-gap.md
  - PROMPT_docs.md
  - PROMPT_spec-review.md
  - PROMPT_final-review.md
  - PROMPT_final-qa.md
  - PROMPT_proof.md
  - PROMPT_cleanup.md

triggers:
  # Session-level (fired into this session's own queue)
  merge_conflict:   PROMPT_merge.md
  stuck_detected:   PROMPT_debug.md
  steer:            PROMPT_steer.md
```

- `pipeline`: cycle. Short repeating sequence, typically 5–7 entries. The compile step resolves `repeat`, expands `onFailure: retry` into loop-plan directives.
- `finalizer`: sequence that runs once `allTasksMarkedDone` holds at cycle boundary. Resets to position 0 if any finalizer agent adds tasks. Only the last agent completing with zero new tasks ends the loop.
- `triggers`: named event → prompt. Session-level triggers fire into the session's own queue; orchestrator workflows use a separate set of triggers (see §Event-driven dispatch and `orchestrator.md`). Daemon-side watchers and workflow authors use these names; no keyword is hardcoded in code.

### loop-plan.json (compiled artifact)

```json
{
  "cycle": [
    "PROMPT_plan.md",
    "PROMPT_build.md",
    "PROMPT_build.md",
    "PROMPT_build.md",
    "PROMPT_build.md",
    "PROMPT_build.md",
    "PROMPT_qa.md",
    "PROMPT_review.md"
  ],
  "finalizer": [
    "PROMPT_spec-gap.md",
    "PROMPT_docs.md",
    "PROMPT_spec-review.md",
    "PROMPT_final-review.md",
    "PROMPT_final-qa.md",
    "PROMPT_proof.md",
    "PROMPT_cleanup.md"
  ],
  "triggers": {
    "merge_conflict":   "PROMPT_merge.md",
    "stuck_detected":   "PROMPT_debug.md",
    "steer":            "PROMPT_steer.md"
  },
  "cyclePosition": 0,
  "iteration": 1,
  "version": 1
}
```

Flat arrays of filenames. All logic lived in the compile step; the session runner just reads positions.

## Prompt file format (frontmatter + body)

Every prompt is a markdown file with YAML frontmatter.

```markdown
---
agent: build
provider: [opencode, copilot, codex, gemini, claude]
model: openrouter/openai/gpt-5.1
reasoning: medium
timeout: 30m
max_retries: 2
retry_backoff: exponential
trigger: null
---

# Build Mode

You are Aloop, an autonomous build agent...
```

Fields (all optional; defaults apply):

- `agent` — identifier (plan, build, review, proof, qa, steer, debug, guard, or project-defined).
- `provider` — single reference or ordered array per the chain grammar (see `provider-contract.md`).
- `model` — provider-specific model ID (optional; resolved from track/version when omitted).
- `reasoning` — `low` | `medium` | `high` | `xhigh` | `none`.
- `color` — terminal color for this phase.
- `trigger` — named event that causes the daemon to queue this prompt (e.g., `merge_conflict`, `stuck_detected`, `burn_rate_alert`). Resolved by the daemon, never by the shim.
- `timeout` — per-prompt provider timeout.
- `max_retries` — per-prompt retry cap before declaring iteration failure.
- `retry_backoff` — `none` | `linear` | `exponential`.

All fields are runtime-mutable — edits to prompt frontmatter take effect on the next iteration that uses that prompt. No compile needed for frontmatter edits.

Precedence for execution settings at permit-grant time (highest first):

1. Queue item's frontmatter (when present; overrides everything)
2. Prompt file's frontmatter
3. Project `aloop/config.yml`
4. Daemon `daemon.yml`

## Chain grammar in frontmatter

`provider:` accepts either a single reference or an ordered array. See `provider-contract.md` for the grammar (`provider[/track][@version]`) and fallthrough semantics.

```yaml
# single
provider: claude/opus@4.7

# chain
provider: [opencode, copilot, codex, gemini, claude]

# mixed
provider: [opencode/openrouter/glm@5.1, claude/opus]
```

Chains are resolved at permit-grant time, allowing live overrides and health changes to influence selection. Chain length is capped at 10 entries; enforced at compile step.

## Shared instructions via `{{include:path}}`

Prompt templates support `{{include:path}}` to inline shared instructions. Expanded during template expansion at session start or queue injection. Paths are relative to the templates directory.

```
aloop/templates/
  instructions/
    review.md              # 9 gates, rejection/approval flow
    qa.md                  # test process, isolation rules
  PROMPT_plan.md
  PROMPT_build.md
  PROMPT_review.md         # frontmatter + {{include:instructions/review.md}}
  PROMPT_final-review.md   # frontmatter + {{include:instructions/review.md}}
  PROMPT_qa.md             # frontmatter + {{include:instructions/qa.md}}
  PROMPT_final-qa.md       # frontmatter + {{include:instructions/qa.md}}
  PROMPT_merge.md          # trigger: merge_conflict
  PROMPT_steer.md          # trigger: steer
  PROMPT_debug.md          # trigger: stuck_detected
  PROMPT_orch_diagnose.md  # trigger: orch_diagnose, burn_rate_alert
```

Includes may themselves contain template variables; expanded after inlining.

## Template variable reference

Variables resolved at two stages:

**Setup-time** (expanded by the compile step when copying templates to session `prompts/`):

| Variable | Value |
|---|---|
| `{{SPEC_FILES}}` | Comma-joined spec file paths from project config |
| `{{REFERENCE_FILES}}` | Comma-joined reference file paths (RESEARCH.md, VERSIONS.md, etc.) |
| `{{VALIDATION_COMMANDS}}` | Bulleted list of backpressure validation commands |
| `{{SAFETY_RULES}}` | Bulleted list of project-specific safety rules |
| `{{PROVIDER_HINTS}}` | Provider-specific guidance (subagent usage, output format hints) |
| `{{CONSTITUTION}}` | Contents of `CONSTITUTION.md` (empty if absent) |
| `{{SUBAGENT_HINTS}}` | Per-phase subagent delegation hints (only for providers with delegation support) |
| `{{include:path}}` | Inlined file contents |

**Runtime** (expanded immediately before provider invocation):

| Variable | Value |
|---|---|
| `{{ITERATION}}` | Current iteration number |
| `{{ARTIFACTS_DIR}}` | Session artifacts directory path |

**Prompt content rule (hard):** orchestrator and queue prompts MUST NOT embed file contents in the body. Reference files by path; let the agent read them. No queue prompt may exceed 10 KB (excluding frontmatter).

## Compile step: pipeline.yml → loop-plan.json

The compile step is the **only** place where pipeline YAML gets interpreted. It runs:

- During **setup verification** (Phase 6) — the first compile is a readiness gate; if `pipeline.yml` cannot be compiled, the project is not marked `ready`. See `setup.md`.
- On `aloop start` (and child dispatch)
- On file-watcher-detected change to `pipeline.yml`
- On explicit `POST /v1/sessions/:id/recompile`
- After certain runtime mutations (escalation, `onFailure: goto X`)

Setup itself may be orchestrated through a dedicated setup workflow, but the same compile discipline still applies: setup-side workflows and runtime workflows are both data compiled into executable plans; neither is interpreted ad hoc by shells.

Responsibilities:

1. Read `aloop/config.yml` + `aloop/pipeline.yml` + per-agent overrides.
2. Resolve `repeat` (unroll to flat cycle array).
3. Resolve `onFailure` directives into runtime-applicable rules (stored separately in session state, not in `loop-plan.json`; the daemon applies them).
4. Resolve trigger name → prompt filename mapping.
5. Resolve chain grammar for any unspecified `provider:` frontmatter using project defaults.
6. Copy prompt files into `<session>/prompts/` with template variables expanded (setup-time set).
7. Write `loop-plan.json` to session state dir.
8. Emit `session.loop_plan.updated` on the bus.

`loop-plan.json` has a `version` field that increments on every write. The daemon logs plan changes as they happen.

Rule: **the shim and the daemon never parse `pipeline.yml`.** If an operation needs pipeline-level knowledge, route it through the compile step.

## Event-driven dispatch (trigger + queue)

The daemon's session runner is dumb in the way `loop.sh` used to try to be:

1. Check queue — if a file exists, run its frontmatter's config, delete it after.
2. Check if in finalizer mode — if yes, pick the next prompt from `finalizer[]`.
3. Otherwise pick the next prompt from `cycle[cyclePosition]`.
4. Request a permit (see Scheduler permit hook).
5. Invoke the resolved adapter.
6. Persist result + usage, update position.

The "intelligence" lives upstream:

- **Queue population** happens via the API (`POST /v1/sessions/:id/steer`) or by the daemon's own watchers (stuck detector, merge detector, burn-rate watcher) matching named triggers from `triggers{}` in `loop-plan.json`.
- **Finalizer switch** is mechanical — enter finalizer when `allTasksMarkedDone`, abort finalizer back to cycle position 0 if any finalizer agent adds tasks.
- **Trigger resolution** is keyword matching: the daemon observes an event (`merge_conflict`), looks up `triggers.merge_conflict`, writes `queue/NNN-<keyword>.md` pointing at that prompt.

No expressions, no conditionals. Keywords and positions.

Two trigger scopes, by convention:

- **Session-level triggers** fire into a running session's own queue. Names have no prefix. Examples: `steer`, `stuck_detected`, `merge_conflict`, `plan_needed`.
- **Orchestrator-level triggers** fire into the orchestrator's queue when it observes something about one of its children. Names use `child_*` prefix or `*_pr` suffix. Examples: `child_stuck`, `burn_rate_alert`, `merge_conflict_pr`, `pr_review_needed`, `user_comment`.

Each workflow's `triggers:` map declares which keyword maps to which prompt; prompts themselves declare `trigger: <keyword>` in frontmatter. The daemon enforces the mapping and the scope. An orchestrator workflow cannot receive a session-level trigger; a child workflow cannot receive an orchestrator-level trigger.

| Condition | Scope | Detected by | Action |
|---|---|---|---|
| Steering from user | session | `POST /v1/sessions/:id/steer` | Queue using `triggers.steer` |
| Pre-iteration merge conflict (child) | session | Git state check before turn | Queue `triggers.merge_conflict` |
| Stuck — N consecutive failures in own session | session | Event stream analyzer | Queue `triggers.stuck_detected` |
| Stuck — orchestrator observing a child | orchestrator | Event stream subscription on `parent=<orch.id>` | Queue `triggers.child_stuck` |
| Burn-rate exceeded | orchestrator | Scheduler emits `scheduler.burn_rate_exceeded` | Queue `triggers.burn_rate_alert` in the orchestrator |
| Change-set needs review | orchestrator | `change_set.opened` / `change_set.updated` | Queue `triggers.pr_review_needed` |
| Change-set conflict with trunk | orchestrator | `change_set.conflict` | Queue `triggers.merge_conflict_pr` |
| Human comment on Epic/Story | orchestrator | `comment.created` with `source=human` | Queue `triggers.user_comment` |
| Orchestrator diagnose needed | orchestrator | Any anomaly classification | Queue `triggers.orch_diagnose` |
| Custom (project-defined) | either | Project-authored watcher | Queue project's named trigger (scope declared) |

## Scheduler permit hook

Before invoking the adapter, the session runner:

1. `POST /v1/scheduler/permits` with `{ session_id, provider_candidate, estimated_cost_usd }` for the first provider in the resolved chain.
2. On grant: proceed to adapter invocation.
3. On denial with `rate_limit`, `provider_unavailable`, or `overrides_exclude_all`: advance to next provider in chain, request again.
4. On denial with `burn_rate_exceeded` or `budget_exceeded`: session pauses; scheduler emits event; orchestrator (if any) gets notified via event bus.
5. On denial with `system_pressure`: wait `retry_after_seconds` and retry the same provider.

The session runner **never** bypasses the scheduler — even if the session is standalone and concurrency is 1. The permit grant records the active provider, facilitates burn-rate accounting, and keeps all load decisions in one place.

## Runtime mutation

The pipeline is mutable at runtime through two mechanisms:

### Override queue

`<session>/queue/` holds files in the same frontmatter format as cycle prompts. The session runner checks this dir before the cycle.

Writers:
- **User** via `POST /v1/sessions/:id/steer` → CLI, dashboard, or bot
- **Daemon watchers** via trigger keywords
- **Orchestrator workflow** via explicit queue writes to its children

Queue files are named `NNN-<description>.md` and consumed in lexical order.

### Plan rewrite

For permanent changes, the compile step rewrites `loop-plan.json`:

- `onFailure: goto build` observed → rewrite `cyclePosition` to build's index.
- Escalation ladder threshold crossed → inject recovery prompt; adjust position.
- Project config change → full recompile.

Agents never modify the plan themselves. Pipeline authoring is a user + compile-step concern.

## Agent contract

> The `aloop-agent` CLI is the single way agents communicate with the daemon.

Agents communicate with the daemon through `aloop-agent`, a small validated CLI present on `PATH` inside every worktree. It is the **only** legitimate way for an agent to produce output or manage task state. File-based contracts (dropping JSON into `.aloop/output/`) are retired by CR #135.

### Discovery

```
aloop-agent list-types
```

Returns the catalog of submit types the daemon accepts for this session, with schemas. Agents call this first to discover what's valid.

### Submit results

```
aloop-agent submit --type <type> [--issue <n>] [--pr <n>]  < result.json
```

Validates the payload against the schema, writes to the session's event log as `agent.result`, and returns a structured exit status. Failure modes:

| Exit | Meaning |
|---|---|
| 0 | Accepted, persisted |
| 10 | Schema violation (stderr has details) |
| 11 | Unknown type |
| 12 | Permission denied (agent role not allowed to submit this type) |
| 20 | Daemon unreachable |
| 22 | Rate-limited (per-session token bucket exhausted) |

### Task management

Replaces TODO.md markdown parsing with a structured task store in session state (survives worktree operations).

```
aloop-agent todo add      --title "..." --priority high --for frontend --from review [--spec-ref ...]
aloop-agent todo complete <id>
aloop-agent todo dequeue  --for <role>
aloop-agent todo list     [--status pending|done --for <role> --format md|json]
aloop-agent todo all-done   # declarative: "I see no pending tasks for me"
```

Task shape:

```json
{
  "id": 13,
  "title": "Gate 2: shallow test in adapter.test.ts:47 — rewrite to assert exact output",
  "status": "pending",
  "priority": "high",
  "from": "review",
  "for": "frontend",
  "spec_ref": "docs/spec/agents.md#review",
  "created_at": "...",
  "created_iteration": 42
}
```

Tasks are routed messages. `from` is the creator role; `for` is the intended executor role. The session runner's cycle hands work to the agent whose role matches the next pending task's `for`, when the workflow uses role-routing (otherwise any agent handles any task).

### Permissions (role-based)

Each agent's frontmatter declares a role; roles have permitted submit types and task operations. Enforced daemon-side at `aloop-agent submit` time via the session's auth handle.

Default permissions:

| Role | Can submit | Can add tasks | Can complete tasks |
|---|---|---|---|
| `plan` | plan_result | yes (any `for`) | only plan tasks |
| `build` | build_result | yes (any `for`) | own tasks |
| `review` | review_result | yes (any `for`) | own tasks |
| `qa` | qa_result | yes (any `for`) | own tasks |
| `proof` | proof_result | no | own tasks |
| `refine` (orchestrator) | refine_result | no | no |
| `decompose` (orchestrator) | decompose_result | no | no |

Projects may extend this table in `aloop/config.yml`.

### Auth handle

Each session gets an `AUTH_HANDLE` environment variable set by the daemon before invoking the provider. `aloop-agent` reads it on every call and includes it with API requests. Handles are scoped to the session, short-lived, and rotated on daemon restart. Agents cannot forge submits for other sessions.

## Orchestrator as a workflow

The orchestrator is a session of kind `orchestrator` running a workflow like any other. No separate binary, no orchestrator-specific runtime.

Example `orchestrator.yaml` (abridged):

```yaml
pipeline:
  - agent: orch_scan
  - agent: orch_decompose
    trigger: decompose_needed
  - agent: orch_refine
    trigger: refine_needed
  - agent: orch_estimate
    trigger: estimate_needed
  - agent: orch_dispatch
  - agent: orch_review
    trigger: pr_review_needed
  - agent: orch_resolver
    trigger: merge_conflict_pr

finalizer:
  - PROMPT_orch_cleanup.md

triggers:
  decompose_needed:       PROMPT_orch_decompose.md
  refine_needed:          PROMPT_orch_refine.md
  estimate_needed:        PROMPT_orch_estimate.md
  pr_review_needed:       PROMPT_orch_review.md
  merge_conflict_pr:      PROMPT_orch_resolver.md
  orch_diagnose:          PROMPT_orch_diagnose.md
  burn_rate_alert:        PROMPT_orch_diagnose.md
  child_stuck:            PROMPT_orch_diagnose.md
```

Runtime-level truths:

- The orchestrator has no worktree (or uses project root read-only).
- It creates children via `POST /v1/sessions` with `kind: child` and `parent_session_id: <self.id>`.
- It subscribes to `/v1/events?parent=<self.id>` and writes to its own queue when it decides to act on anomalies — no daemon-side self-healing daemon.
- It uses `aloop-agent` just like any other session — it submits `decompose_result`, reads `child_stuck` events, and queues `PROMPT_orch_diagnose.md` on its own queue when needed.

Self-healing is intelligent because it is an agent turn (the diagnose prompt), not a shell script reacting to metrics. The diagnose turn's output is either a new queue item (e.g., "kill child X," "pause dispatch," "raise burn-rate threshold") or a `no_action` submit.

## Child loops as workflows

A child loop is a session of kind `child` running a workflow like `plan-build-review.yaml`. No separate runtime.

- Created by an orchestrator via the API.
- Has its own worktree (daemon creates it on session start).
- Has its own `loop-plan.json` compiled from the chosen workflow.
- Uses `aloop-agent` for all output.
- Cannot create grandchildren (see `api.md` §Sessions §Create).

Working files (`TODO.md`, `TASK_SPEC.md`, `RESEARCH.md`, `REVIEW_LOG.md`) are tracked via `aloop-agent`'s task store and per-session state directories — surviving worktree clobbers by design (CR #283 root cause eliminated).

## Subagent delegation

Some providers (opencode, claude, copilot, codex) support spawning child sessions with independent model selection (subagents). This is a within-turn delegation, not a new aloop session.

Aloop ships a catalog of opencode subagent definitions in `.opencode/agents/` (installed by `aloop setup`). Per-phase hints injected via `{{SUBAGENT_HINTS}}` tell the primary agent which subagents are available.

| Subagent | Model class | Purpose | Used by |
|---|---|---|---|
| `vision-reviewer` | vision | screenshot layout/visual analysis | proof, review |
| `vision-comparator` | vision | baseline vs current comparison | proof |
| `code-critic` | high-reasoning | deep code review | review |
| `test-writer` | fast-cheap | generate tests from spec | build, verify |
| `error-analyst` | fast-cheap | parse stack traces, suggest fixes | build on failure |
| `spec-checker` | reasoning | verify implementation matches spec | review |
| `security-scanner` | reasoning | OWASP / secrets / deps audit | review, guard |
| `accessibility-checker` | vision | WCAG compliance | proof, verify |

Subagent integration is provider-specific; the aloop daemon exposes it through the `{{SUBAGENT_HINTS}}` variable and the `.opencode/agents/` directory. Providers without native subagent support see an empty `{{SUBAGENT_HINTS}}`.

**Subagent catalog lives in `agents.md` §Subagent catalog.** This section lists only the integration mechanism; the canonical list of named subagents and their purposes is in `agents.md`.

## Reasoning effort

Reasoning-capable models honor `reasoning:` in prompt frontmatter. Levels: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`. Defaults (configurable):

| Agent | Default effort | Rationale |
|---|---|---|
| plan | `high` | Gap analysis, spec comparison |
| build | `medium` | Implementation speed |
| review | `xhigh` | Catch subtle quality issues |
| proof | `medium` | Artifact generation |
| steer | `medium` | Directive parsing |

Adapters translate the level to provider-native parameters (OpenAI Responses API, OpenRouter `reasoning.effort`, opencode `--variant`).

## Vision models

Phases requiring vision (proof, review, subagents like `vision-reviewer`) declare `capabilities.vision: true` in the adapter or the phase config. Chain resolution excludes providers lacking vision when the phase requires it.

Operational notes for opencode: custom OpenRouter models need `modalities` declared in `opencode.json` to enable image inputs. Without it, images pass as tool-call file reads instead of vision payloads. This is an adapter-level concern; the contract is: phases that need vision get an adapter that supports it, or chain resolution fails.

ZDR caveat: OpenAI's Zero Data Retention explicitly excludes image inputs. For production visual review with sensitive content, prefer Anthropic Claude (direct API with org ZDR), AWS Bedrock, or Gemini via Vertex AI.

## `aloop start` as unified entry point

`aloop start` is the single entry point for all session kinds. The CLI reads project config, resolves the workflow, and calls the API.

```
aloop start                          # reads project config → resolves workflow
aloop start --workflow plan-build-review
aloop start --kind orchestrator      # explicit orchestrator session
aloop start --resume <session-id>    # resume interrupted session
```

Under the hood: `POST /v1/sessions` with the resolved config. There is no separate `aloop orchestrate` path; orchestrator is a workflow name, not a command.

Internal/plumbing commands (hidden from default `--help`):

- `resolve`, `discover`, `scaffold` — setup plumbing
- `gh` — policy-enforced GitHub proxy (used by orchestrator workflows only)
- `devcontainer` — container generation
- `update` — runtime asset refresh
- `daemon start|stop|restart|status` — lifecycle
- `debug-*` — diagnostic commands

User-facing default `--help` shows ~8 commands: `setup`, `start`, `status`, `steer`, `stop`, `dashboard`, `providers`, `install`.

---

## Invariants (enforced across compile and runtime)

1. **The shim and the daemon never parse YAML.** The compile step is the single YAML reader.
2. **All decisions are resolvable from config + events.** No hardcoded thresholds, paths, or phase lists in code.
3. **Agents only talk through `aloop-agent`.** File-based contract is retired.
4. **Permits gate every turn.** No exceptions, no bypasses.
5. **Provider chains are resolved at permit-grant time.** Live overrides and health matter.
6. **Queue + finalizer + cycle are the only scheduling surfaces.** Everything else is upstream.
7. **Triggers are keywords, not expressions.** If a project needs a new trigger, it registers a name and a prompt. No predicates in the plan.
