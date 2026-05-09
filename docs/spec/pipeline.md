# Pipeline

> **Reference document.** The workflow step model: how pipelines are authored, compiled, executed, and mutated. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Configurable Agent Pipeline, §Reasoning Effort, §Vision Model; SPEC-ADDENDUM.md §Prompt Reference Rule, §`aloop start` Unification; CRs #287 (chain grammar), #135 (agent CLI), #94 (data-driven), #191 (compile step).

## Table of contents

- Core concept: steps as the unit
- Workflow vs pipeline vs workflow-plan
- Prompt file format (frontmatter + body)
- Prompt context
- Runtime extension manifests
- Exec step manifest format
- Chain grammar in frontmatter
- Shared instructions via `{{include:path}}`
- Template variable reference
- Compile step: workflow YAML → workflow-plan.json
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

## Core concept: steps as the unit

A **step** is a named pipeline unit. v1 defines two step kinds:

- **`agent`** — a model-driven turn backed by a prompt file, provider/model preference, reasoning effort, and optional trigger.
- **`exec`** — a deterministic code step backed by a manifest that names a runtime and a checked-in file to execute.

Both are data. Neither is inline logic in YAML.

A **pipeline** is a handler-local authored sequence of steps with transition rules (`repeat`, `onFailure`). The default start handler may use `plan → build × 5 → proof → qa → review`, but this is just one possible pipeline — projects author their own.

A **workflow** is a trigger-keyed map of handlers. Each handler owns a pipeline and, optionally, a finalizer. Plan-build-review, review-only, orchestrator-scan-dispatch, and maintenance-loop are all the same primitive: workflow YAML compiled into handler plans.

Agents are **not hardcoded**. `plan`, `build`, `proof`, `qa`, `review` are bundled defaults. Projects can define any named agent (`verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

Exec steps are also **not hardcoded**. Projects define them by adding manifests such as `EXEC_regen-api.yml` or `EXEC_sync-issues.yml` under the templates directory and referencing them from workflow handler `pipeline` phases.

Exec steps are the first use of Aloop's manifest-backed extension pattern. Prompt context providers use the same discipline: YAML declares a typed manifest, the actual logic lives in checked-in code, and the daemon executes it through a narrow lifecycle. Do not invent a separate plugin mechanism for context, metrics, event projection, or guards without first checking whether it is another typed runtime extension manifest.

## Workflow vs pipeline vs workflow-plan

Three artifacts, compiled in order:

| Artifact | Authored by | Consumed by | Lifetime |
|---|---|---|---|
| workflow file (`aloop/workflows/*.yaml` or project override) | User / setup | Compile step | Edit-at-will; re-compiles on change |
| `workflow-plan.json` (session) | Compile step | Daemon + shell shim | Per session; rewritten on mutations |
| Live session state | Daemon | Clients (CLI, dashboard) | Per session; in SQLite + JSONL |

The shell shim and the session runner **only** consume compiled handler plans, prompt files, and compiled runtime extension descriptors. Neither parses workflow YAML. The compile step is the one place workflow YAML gets interpreted.

### Workflow YAML (source of truth)

```yaml
on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - exec: regen-api
      - agent: build
        repeat: 5
        onFailure: retry
      - agent: qa
      - agent: review
        onFailure: goto build
    finalizer:
      - agent: spec-gap
      - agent: docs
      - agent: spec-review
      - agent: final-review
      - agent: final-qa
      - agent: proof
      - exec: cleanup-generated

  merge_conflict:
    pipeline:
      - agent: merge

  stuck_detected:
    pipeline:
      - agent: debug

  steer:
    pipeline:
      - agent: steer
```

- `on`: trigger-keyed handler map. Every key is a workflow event handler name. There is no top-level `pipeline` in the workflow catalog format.
- `on.start`: conventional cycle handler. `cycle: true` means this handler repeats until finalizer conditions are met. Event-driven workflows may omit `start`.
- `pipeline`: handler-local sequence. Each entry is either `agent: <name>` or `exec: <name>`. The compile step resolves `repeat`, expands `onFailure: retry` into handler-plan directives, and resolves names to prompt/manifests.
- `finalizer`: optional handler-local sequence that runs once `allTasksMarkedDone` holds at cycle boundary for cyclic handlers. Uses the same step syntax as `pipeline`.
- other `on.<event>` handlers: dormant until the daemon queues that event into the session. External triggers created through `/v1/triggers` queue handler names; they are not defined as workflow YAML predicates.

### workflow-plan.json (compiled artifact)

```json
{
  "_v": 3,
  "workflow": "plan-build-review",
  "handlers": {
    "start": {
      "cycle": true,
      "pipeline": [
        { "kind": "agent", "ref": "PROMPT_plan.md" },
        { "kind": "exec", "ref": "EXEC_regen-api.json" },
        { "kind": "agent", "ref": "PROMPT_build.md" },
        { "kind": "agent", "ref": "PROMPT_build.md" },
        { "kind": "agent", "ref": "PROMPT_build.md" },
        { "kind": "agent", "ref": "PROMPT_build.md" },
        { "kind": "agent", "ref": "PROMPT_build.md" },
        { "kind": "agent", "ref": "PROMPT_qa.md" },
        { "kind": "agent", "ref": "PROMPT_review.md" }
      ],
      "finalizer": [
        { "kind": "agent", "ref": "PROMPT_spec-gap.md" },
        { "kind": "agent", "ref": "PROMPT_docs.md" },
        { "kind": "agent", "ref": "PROMPT_spec-review.md" },
        { "kind": "agent", "ref": "PROMPT_final-review.md" },
        { "kind": "agent", "ref": "PROMPT_final-qa.md" },
        { "kind": "agent", "ref": "PROMPT_proof.md" },
        { "kind": "exec", "ref": "EXEC_cleanup-generated.json" }
      ],
      "transitions": {
        "2": { "type": "retry" },
        "8": { "type": "goto", "target": "build" }
      }
    },
    "merge_conflict": {
      "pipeline": [{ "kind": "agent", "ref": "PROMPT_merge.md" }]
    },
    "stuck_detected": {
      "pipeline": [{ "kind": "agent", "ref": "PROMPT_debug.md" }]
    },
    "steer": {
      "pipeline": [{ "kind": "agent", "ref": "PROMPT_steer.md" }]
    }
  },
  "version": 1
}
```

The compiled artifact is a deterministic handler table. It is intentionally lower-level than authored workflow YAML:

- handler names are already validated
- `repeat` is already expanded
- `agent` and `exec` references are already resolved
- transition targets are already checked
- prompt templates and exec manifests are already copied/resolved into session state

Any trigger can queue any handler in this table. A queued handler does **not** rewrite or replace the `start` cycle. It creates a handler run with its own pipeline cursor. When that handler finishes, the runner returns to the next queued handler; if the queue is empty and `start.cycle` exists, it resumes the `start` handler's saved cursor. This makes event handling deterministic without interpreting workflow YAML at runtime.

The compiled plan is still needed. Without it, every turn would need to parse YAML, resolve names, expand repeats, validate transitions, and discover prompt/exec files at runtime. The plan is the frozen executable form of the workflow; session state records which handler run is active and where its cursor is.

## Prompt file format (frontmatter + body)

Every prompt is a markdown file with YAML frontmatter.

```markdown
---
agent: build
context: task_recall
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
- `context` — optional context id, object, or ordered list. The daemon resolves these before provider invocation and injects normalized context blocks into the prompt. See §Prompt context and `context.md`.
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

## Prompt context

`context` is the prompt-facing primitive for optional, daemon-built context.

It is deliberately generic. A prompt should not know whether its context comes from SQLite projections, JSONL replay, MemPalace, Zep, another memory system, metrics, tracker state, or a project-specific integration. The prompt only names the context it wants; code owns the retrieval, normalization, budgeting, and observation behavior.

Minimal form:

```yaml
---
agent: orch_refine
context: orch_recall
---
```

Multiple contexts:

```yaml
---
agent: orch_diagnose
context:
  - orch_recall
  - operational_metrics
---
```

Optional local override:

```yaml
---
agent: orch_conversation
context:
  - id: orch_recall
    budget_tokens: 8000
---
```

The override form should remain rare. If prompt frontmatter starts encoding filters, scoring rules, or workflow decisions, that logic belongs in the context plugin code or daemon/project config.

Prompt-facing context names should describe the job, not the implementation:

- `orch_recall`
- `story_recall`
- `review_history`
- `operational_metrics`
- `human_steering`
- `proof_context`

Avoid implementation names such as `mempalace_total_recall` in prompt files. A project may later remap `orch_recall` from the built-in store to MemPalace or another backend without changing prompts.

See `context.md` for the plugin boundary, normalized context block shape, and guardrails.

## Runtime extension manifests

Aloop uses one extensibility pattern for project-defined code: **runtime extension manifests**.

A manifest is configuration that points at checked-in code and declares how the daemon may run it. It is not source code. This prevents workflow YAML, prompt frontmatter, or daemon config from becoming an embedded programming language.

Current manifest kinds:

| Kind | Lifecycle | Referenced from | Spec |
|---|---|---|---|
| `exec` | Runs as a pipeline step | workflow handler `exec:` entries | §Exec step manifest format |
| `context-provider` | Builds and optionally observes prompt context before/after an agent turn | prompt `context:` ids via project/daemon `contexts` config | `context.md` |

Both kinds follow the same rules:

- logic lives in a checked-in file, usually TypeScript for portable project logic
- the manifest declares runtime, file, args, timeout, cwd, platforms, env allow-list, and capabilities where relevant
- no inline scripts or expressions in YAML
- durable state changes go through daemon APIs or `aloop-agent`, never direct session-file writes
- execution is daemon-supervised with timeout, environment filtering, event logging, and policy checks

Future extension kinds such as `event-projector`, `dispatch-guard`, or `artifact-indexer` should reuse this manifest pattern and define a narrow typed lifecycle. They should not become generic "run code at any hook" plugins.

## Exec step manifest format

An exec step is defined by a checked-in manifest file under the templates directory:

```text
aloop/templates/
  EXEC_regen-api.yml
  EXEC_cleanup-generated.yml
```

Pipeline authors reference the step by name:

```yaml
pipeline:
  - agent: plan
  - exec: regen-api
  - agent: build
```

Example manifest:

```yaml
kind: exec
runtime: bun
file: scripts/regen-api.ts
args: ["--check"]
cwd: worktree
timeout: 5m
platforms: [darwin, linux]
env_allowlist: [OPENAPI_BASE_URL]
idempotent: true
```

Fields:

- `kind` — must be `exec`.
- `runtime` — executor. v1 allows `bun`, `node`, `bash`, or `pwsh`.
- `file` — checked-in repo path to execute. Required. Inline code in YAML is forbidden.
- `args` — ordered argument list.
- `cwd` — `worktree`, `repo`, or an explicit relative path under one of those roots.
- `timeout` — hard execution timeout.
- `platforms` — optional allow-list. If omitted, step is assumed portable across supported platforms.
- `env_allowlist` — env vars the daemon may pass through to the step. Default is empty.
- `idempotent` — whether retrying the step is expected to be safe. `onFailure: retry` is valid only when this is `true`.

Hard rules:

- Exec manifests are configuration, not source code. The code lives in checked-in files like `scripts/*.ts`, `scripts/*.js`, `scripts/*.sh`, or `scripts/*.ps1`.
- Exec manifests are one kind of runtime extension manifest. Keep shared execution semantics aligned with `context-provider` manifests in `context.md`.
- Durable state changes still go through official session contracts. If an exec step needs to add tasks or submit structured output, it calls `aloop-agent`; it does not write daemon/session state files directly.
- Prefer `bun` or `node` for project-defined logic. `bash` and `pwsh` are valid for environment glue, but cross-platform workflows should not depend on bash alone.
- Exec steps are for deterministic hooks, code generation, validations, and integrations. They are not a replacement for judgment-heavy prompts such as review, diagnosis, or human conversation.

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

## Compile step: workflow YAML → workflow-plan.json

The compile step is the **only** place where workflow YAML gets interpreted. It runs:

- During **setup verification** (Phase 6) — the first compile is a readiness gate; if workflow YAML cannot be compiled, the project is not marked `ready`. See `setup.md`.
- On `aloop start` (and child dispatch)
- On file-watcher-detected change to workflow YAML
- On explicit `POST /v1/sessions/:id/recompile`
- After certain runtime mutations (escalation, `onFailure: goto X`)

Setup itself may be orchestrated through a dedicated setup workflow, but the same compile discipline still applies: setup-side workflows and runtime workflows are both data compiled into executable plans; neither is interpreted ad hoc by shells.

Responsibilities:

1. Read `aloop/config.yml` + selected workflow file + per-agent overrides.
2. Validate every `on.<event>` handler name and phase list.
3. Resolve `repeat` inside each handler (unroll to compiled handler step arrays).
4. Resolve `onFailure` directives into runtime-applicable rules stored on the compiled handler.
5. Validate transition targets inside the handler's compiled step list.
6. Resolve `agent: <name>` to `PROMPT_<name>.md` and `exec: <name>` to `EXEC_<name>.yml`.
7. Resolve chain grammar for any unspecified `provider:` frontmatter using project defaults.
8. Copy prompt files into `<session>/prompts/` with template variables expanded (setup-time set).
9. Copy runtime extension manifests referenced by the workflow or prompt context config into the session state dir and compile them to runtime-ready JSON descriptors.
10. Write `workflow-plan.json` to session state dir.
11. Emit `session.workflow_plan.updated` on the bus.

`workflow-plan.json` has a `version` field that increments on every write. The daemon logs plan changes as they happen.

Rule: **the shim and the daemon never parse workflow YAML.** If an operation needs workflow-level knowledge, route it through the compile step.

## Event-driven dispatch (trigger + queue)

The daemon's session runner is deliberately mechanical:

1. Check the session queue for a queued workflow handler.
2. If a handler is queued, create a handler run with its own cursor over that handler's compiled pipeline.
3. If a handler run is active, pick its next compiled pipeline step.
4. If no handler run is active and `start.cycle` exists, resume the saved `start` handler cursor.
5. If the `start` handler is in finalizer mode, pick the next compiled `start.finalizer` step.
6. Request a permit (see Scheduler permit hook).
7. Invoke the resolved provider adapter or runtime extension.
8. Persist result + usage, update the active handler cursor, and close the handler run when its pipeline completes.

The decision-making lives upstream:

- **Queue population** happens via the API (`POST /v1/sessions/:id/steer`), daemon watchers, durable trigger records, tracker/external adapters, or orchestrator decisions. Each queue entry names one compiled handler.
- **Finalizer switch** is mechanical — enter finalizer when `allTasksMarkedDone`, abort finalizer back to cycle position 0 if any finalizer agent adds tasks.
- **Trigger resolution** is event-to-handler dispatch: external/runtime code creates a trigger record or emits a normalized event, the daemon validates that the target handler exists in the compiled plan, and the queue stores that handler name plus the trigger payload.
- **Exec scope in v1** is deliberate: `exec` steps may appear in handler `pipeline` and `finalizer` phases. Event-driven diagnosis and conversation remain agent turns.

No expressions, no conditionals. Handler names and cursors.

Two trigger scopes, by convention:

- **Session-level triggers** fire into a running session's own queue. Names have no prefix. Examples: `steer`, `stuck_detected`, `merge_conflict`, `plan_needed`.
- **Orchestrator-level triggers** fire into the orchestrator's queue when it observes something about one of its children. Names use `child_*` prefix or `*_pr` suffix. Examples: `child_stuck`, `burn_rate_alert`, `merge_conflict_pr`, `pr_review_needed`, `user_comment`.

Each workflow's `on:` map declares which handler names are valid. Triggers are generic records with a normalized source topic, refs, labels, evidence refs, severity, and payload. External producers create those records through `/v1/triggers` or through runtime integrations that call the same internal API. The daemon enforces target handler existence and scope. An orchestrator workflow cannot receive a session-level trigger; a child workflow cannot receive an orchestrator-level trigger unless that handler is explicitly present in its compiled plan.

| Condition | Scope | Detected by | Action |
|---|---|---|---|
| Steering from user | session | `POST /v1/sessions/:id/steer` | Queue `on.steer` |
| Pre-iteration merge conflict (child) | session | Git state check before turn | Queue `on.merge_conflict` |
| Stuck — N consecutive failures in own session | session | Event stream analyzer | Queue `on.stuck_detected` |
| Stuck — orchestrator observing a child | orchestrator | Event stream subscription on `parent=<orch.id>` | Queue `on.child_stuck` |
| Burn-rate exceeded | orchestrator | Scheduler emits `scheduler.burn_rate_exceeded` | Queue `on.burn_rate_alert` in the orchestrator |
| Change-set needs review | orchestrator | `change_set.opened` / `change_set.updated` | Queue `on.pr_review_needed` |
| Change-set conflict with trunk | orchestrator | `change_set.conflict` | Queue `on.merge_conflict_pr` |
| Human comment on Epic/Story | orchestrator | `comment.created` with `source=human` | Queue `on.user_comment` |
| Orchestrator diagnose needed | orchestrator | Any anomaly classification | Queue `on.orch_diagnose` |
| Custom (project-defined) | either | Project-authored watcher or integration | Queue any compiled `on.<handler>` target |

## Scheduler permit hook

Before invoking the adapter or runtime, the session runner:

1. For an agent step: `POST /v1/scheduler/permits` with `{ session_id, provider_candidate, estimated_cost_usd }` for the first provider in the resolved chain.
2. For an exec step: `POST /v1/scheduler/permits` with `{ session_id, executor_kind: "exec", runtime }`.
3. On grant: proceed to execution.
4. On denial with `rate_limit`, `provider_unavailable`, or `overrides_exclude_all` for an agent step: advance to next provider in chain, request again.
5. On denial with `burn_rate_exceeded` or `budget_exceeded`: session pauses; scheduler emits event; orchestrator (if any) gets notified via event bus.
6. On denial with `system_pressure`: wait `retry_after_seconds` and retry the same provider/runtime.

The session runner **never** bypasses the scheduler — even if the session is standalone and concurrency is 1. The permit grant records the active provider, facilitates burn-rate accounting, and keeps all load decisions in one place.

## Runtime mutation

The pipeline is mutable at runtime through two mechanisms:

### Handler queue

The session queue holds durable handler-run requests. The session runner checks it before resuming the cyclic `start` handler.

Writers:
- **User** via `POST /v1/sessions/:id/steer` → CLI, dashboard, or bot
- **Daemon watchers** via trigger records
- **Orchestrator workflow** via explicit queue writes to its children

Queue records are ordered by monotonic sequence and consumed in that order. A record names a compiled handler and carries the normalized trigger payload.

### Plan rewrite

For permanent workflow changes, the compile step rewrites `workflow-plan.json`:

- `onFailure: goto build` observed → update the active handler cursor to the compiled `build` step.
- Escalation ladder threshold crossed → queue or inject a recovery handler; adjust the active handler cursor only through compiled transition rules.
- Project config change → full recompile.

Agents and exec steps never modify the plan themselves. Pipeline authoring is a user + compile-step concern.

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
| `consistency` (orchestrator) | consistency_result | no | no |
| `decompose` (orchestrator) | decompose_result | no | no |

Projects may extend this table in `aloop/config.yml`.

### Auth handle

Each session gets an `AUTH_HANDLE` environment variable set by the daemon before invoking the provider. `aloop-agent` reads it on every call and includes it with API requests. Handles are scoped to the session, short-lived, and rotated on daemon restart. Agents cannot forge submits for other sessions.

## Orchestrator as a workflow

The orchestrator is a session of kind `orchestrator` running a workflow like any other. No separate binary, no orchestrator-specific runtime, no separate trigger engine, and no special scheduler path. Orchestration is composition of the same workflow, event, prompt, queue, permit, artifact, tracker, and change-set primitives used by every other session.

Example `orchestrator.yaml` (abridged):

```yaml
on:
  start:
    cycle: true
    pipeline:
      - agent: orch_scan
      - agent: orch_consistency
      - agent: orch_dispatch
    finalizer:
      - agent: orch_cleanup

  decompose_needed:
    pipeline:
      - agent: orch_decompose
      - agent: orch_refine
      - agent: orch_estimate

  refine_needed:
    pipeline:
      - agent: orch_refine
      - agent: orch_estimate

  estimate_needed:
    pipeline:
      - agent: orch_estimate

  pr_review_needed:
    pipeline:
      - agent: orch_review

  merge_conflict_pr:
    pipeline:
      - agent: orch_resolver

  burn_rate_alert:
    pipeline:
      - agent: orch_diagnose

  child_stuck:
    pipeline:
      - agent: orch_diagnose
```

Runtime-level truths:

- The orchestrator has no worktree (or uses project root read-only).
- It creates children via `POST /v1/sessions` with `kind: child` and `parent_session_id: <self.id>`.
- It subscribes to `/v1/events?parent=<self.id>` and writes to its own queue when it decides to act on anomalies — no daemon-side self-healing daemon.
- It uses `aloop-agent` just like any other session — it submits `decompose_result`, `consistency_result`, reads `child_stuck` events, and queues `PROMPT_orch_diagnose.md` on its own queue when needed.

Self-healing is intelligent because it is an agent turn (the diagnose prompt), not a shell script reacting to metrics. The diagnose turn's output is either a new queue item (e.g., "kill child X," "pause dispatch," "raise burn-rate threshold") or a `no_action` submit.

Projects may run different orchestrator workflows with the same mechanism. For example, `maintenance-loop.yaml` is a long-running repository-upkeep orchestrator with no default cycling `start` handler. Normalized events such as `dependency_signal`, `coverage_signal`, `docs_signal`, `demo_signal`, `refactor_signal`, and `bug_signal` wake only the relevant category agent. It still creates normal Epics/Stories, still runs `orch_refine` and `orch_consistency`, and still dispatches children using ordinary Story workflows such as `refactor`, `docs-only`, `frontend-slice`, `migration`, or `plan-build-review`.

`maintenance-loop` is therefore not a new daemon mode. It is just another workflow file for a `kind: orchestrator` session.

## Child loops as workflows

A child loop is a session of kind `child` running a workflow like `plan-build-review.yaml`. No separate runtime.

- Created by an orchestrator via the API.
- Has its own worktree (daemon creates it on session start).
- Has its own `workflow-plan.json` compiled from the chosen workflow.
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
6. **Queue + handler cursor + finalizer + cycle are the only scheduling surfaces.** Everything else is upstream.
7. **Triggers are records, not workflow predicates.** If a project needs a new trigger, external/runtime code creates a normalized trigger record that targets an existing `on.<handler>` name. No predicates in the plan.
8. **Inline code in YAML is forbidden.** Project-defined code runs through checked-in runtime extension manifests and files, never through shell snippets or expressions embedded in workflow YAML, prompt frontmatter, or daemon config.
