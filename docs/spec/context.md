# Prompt Context

> **Reference document.** Prompt context is the daemon-owned extension point for adding bounded, source-cited context to an agent turn. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: `pipeline.md` prompt frontmatter, `architecture.md` daemon boundary, `metrics.md` curated views, `refinement.md` decision handling.

## Table of contents

- Purpose
- Prompt-facing primitive
- Context plugins
- Context provider manifests
- Normalized context blocks
- Configuration
- Runtime lifecycle
- Guardrails
- Initial context ids

---

## Purpose

Some prompts benefit from stronger continuity than their immediate task payload provides. Orchestrator-side prompts may need to recall human steering, prior decisions, stale assumptions, failed dispatches, proof artifacts, and related Stories across time. Build prompts often benefit from the opposite: a small, current task context with little historical drag.

Prompt context gives each prompt a small declaration:

```yaml
context: orch_recall
```

The daemon turns that declaration into a bounded, cited context block before provider invocation. The prompt does not know which storage or retrieval system produced it.

## Prompt-facing primitive

The prompt-facing surface is only `context`.

Valid forms:

```yaml
context: orch_recall
```

```yaml
context:
  - orch_recall
  - operational_metrics
```

```yaml
context:
  - id: orch_recall
    budget_tokens: 8000
```

The first two forms should cover normal use. The object form is for narrow overrides such as token budget. It is not a place to write retrieval logic.

Context ids should describe the job:

- `orch_recall`, not `mempalace_recall`
- `review_history`, not `sqlite_vector_search`
- `operational_metrics`, not `prometheus_dump`

This keeps prompts stable when the backing implementation changes.

## Context plugins

A context plugin is code registered with the daemon through the same runtime extension manifest pattern used by pipeline `exec` steps. It adapts one backing system into Aloop's normalized context shape.

Example implementations:

- built-in event recall over JSONL and SQLite projections
- MemPalace-backed recall
- Zep or Graphiti-backed temporal graph recall
- project-specific tracker or proof artifact recall
- curated operational metrics

The interface is intentionally narrow:

```ts
interface ContextPlugin {
  id: string;
  build(input: ContextInput): Promise<ContextBlock[]>;
  observe?(input: TurnObservation): Promise<void>;
}
```

`build` runs before provider invocation and returns normalized blocks. `observe` runs after the turn completes and may index the turn result or captured events.

A context plugin may read daemon state through typed APIs, query external systems, and return context. It may not mutate tracker state, change workflow transitions, alter provider execution, or patch prompt text outside its own context block.

## Context provider manifests

Context providers are not a separate plugin system. They are runtime extension manifests with a different `kind` and lifecycle from pipeline `exec` steps.

Example:

```yaml
kind: context-provider
id: orch_recall
runtime: bun
file: scripts/context/orch-recall.ts
timeout: 10s
cwd: repo
platforms: [darwin, linux]
env_allowlist: [MEMPALACE_URL]
capabilities:
  read_events: true
  read_tracker: true
  read_metrics: true
  network: true
```

The referenced file implements the context-provider contract:

```ts
export async function build(input: ContextInput): Promise<ContextBlock[]> {
  // Adapt MemPalace, SQLite projections, Zep, or project-specific logic.
}

export async function observe(input: TurnObservation): Promise<void> {
  // Optional: index completed turns or daemon-captured events.
}
```

Execution should be daemon-supervised and preferably out-of-process: the daemon sends JSON input, receives JSON output, enforces timeout and capabilities, filters environment variables, and emits events. Project code should not be imported directly into the daemon process.

Context provider manifests share the extension discipline from `pipeline.md` §Runtime extension manifests:

- YAML is configuration only
- provider-specific API handling lives in checked-in code
- capabilities are declared and policy-checked
- durable state changes use daemon APIs, not direct session-file writes
- outputs are normalized before they reach the prompt

## Normalized context blocks

Plugins return context in daemon-owned shape:

```ts
type ContextBlock = {
  id: string;
  title: string;
  body: string;
  sources: SourceRef[];
  confidence?: number;
  createdAt?: string;
};
```

The daemon is responsible for rendering these blocks into the final prompt body. Every block that asserts project history, human intent, prior evidence, or operational state should include source references.

The provider receives rendered context, not raw plugin API output.

## Configuration

Prompt frontmatter should stay small. Project or daemon config maps context ids to plugins and shallow defaults:

```yaml
contexts:
  orch_recall:
    provider: CONTEXT_orch-recall.yml
    budget_tokens: 6000
    include_sources: true
```

Another project can remap the same prompt-facing id:

```yaml
contexts:
  orch_recall:
    provider: CONTEXT_mempalace-recall.yml
    budget_tokens: 6000
    include_sources: true
```

`provider` names a `context-provider` runtime extension manifest. Configuration is data, not code. If a context needs non-trivial filtering, ranking, consolidation, or provider-specific API handling, that belongs in the provider implementation.

## Runtime lifecycle

For each agent turn:

1. The session runner resolves the next prompt and frontmatter.
2. The daemon resolves each declared `context` id through the context registry.
3. Each plugin builds normalized context blocks within its configured token budget.
4. The daemon renders the compiled prompt body plus context blocks.
5. The provider runs the turn.
6. The daemon persists a `context.injected` event with context ids, source refs, and token counts.
7. After the turn, plugins with `observe` receive the daemon-captured turn observation for indexing.

The event trail must make it clear what memory or context the agent saw. Debugging an agent decision should not require guessing which hidden recall influenced it.

## Guardrails

Prompt context is not a generic behavior hook system.

Allowed:

- build prompt context before a turn
- normalize external memory or metrics into cited blocks
- observe completed turns for indexing
- enforce per-context token budgets

Forbidden:

- mutate tracker state
- mutate workflow state
- change provider selection or execution
- bypass `aloop-agent submit`
- read arbitrary process output outside daemon-captured events
- give agents direct access to raw JSONL when a curated projection exists
- encode business logic in frontmatter

Current source of truth always outranks retrieved context:

1. current code and tests
2. current spec, constitution, and Story
3. current tracker comments and status
4. proof artifacts
5. retrieved context

Contradictory context should be rendered as contradictory evidence, not silently resolved by the plugin.

## Initial context ids

Suggested built-in ids:

| Context id | Intended users | Shape |
|---|---|---|
| `orch_recall` | `orch_refine`, `orch_conversation`, `orch_consistency`, `orch_dispatch` | Human steering, decisions, related Stories, prior proof, stale assumptions, blockers |
| `task_recall` | `build` and specialized build prompts when needed | Current task, same-Story failed attempts, current blockers, review-requested corrections |
| `story_recall` | `plan`, `proof` | Current Story history, parent Epic, dependencies, recent review/proof outcomes |
| `review_history` | `review`, `spec-review`, final review prompts | Prior review findings, unresolved follow-up tasks, recurring module risks |
| `operational_metrics` | `orch_diagnose` | Curated metric view, provider failures, burn-rate history, stuck-session signals |
| `human_steering` | queue/steer/conversation prompts | Recent human comments and explicit steering for the affected scope |

Build prompts should default to no context or a narrow task-scoped context. Full orchestrator recall should be opt-in by prompt frontmatter or workflow default, not inherited globally.
