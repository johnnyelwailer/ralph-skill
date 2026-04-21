# Workflows

> **Reference document.** The shipped workflow catalog and the rules for selecting one per Story. A workflow is data — a YAML file describing cycle, finalizer, triggers, and per-phase agent assignments. The daemon executes any workflow uniformly. This document specifies the ones that ship and how the orchestrator picks the right one for each Story. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: CR #281 (specialized agent roles), CR #275 (wave + focus dispatch), `pipeline.md` (workflow mechanism), `agents.md` (per-role contracts), `work-tracker.md` (Story metadata fields).

## Table of contents

- Why per-Story workflow selection
- Catalog of shipped workflows
- Workflow file structure
- Selection logic
- Project overrides
- Custom workflows
- Invariants

---

## Why per-Story workflow selection

A 30-line CSS adjustment doesn't need five build iterations, a QA round, and a proof phase. A database migration desperately needs a backwards-compatibility check, integration tests, and a rollback plan. A documentation update doesn't need any of the above. Running the same `plan-build-review` cycle for every Story is either over-cautious (slow + expensive on small work) or under-cautious (skips gates the work needed).

aloop's framework already supports this — `dispatch_result` carries a `workflow` field; workflows are data files; the daemon's session runner doesn't know one workflow from another. This document fills the missing pieces:

- A shipped catalog of workflows tuned to common Story shapes.
- Deterministic selection logic so the orchestrator picks the right one without ad-hoc reasoning.
- A clear path for projects to override or add their own.

## Catalog of shipped workflows

All ship under `aloop/workflows/` and install into `~/.aloop/workflows/` on `aloop install`. Projects may override any of them by placing a same-named file under `<project>/.aloop/workflows/`.

### `quick-fix`

```
cycle:     plan → build → review
finalizer: spec-gap → docs → final-review → cleanup
triggers:  steer, merge_conflict, stuck_detected
```

For: single-file fixes, small refactors, S-tier complexity Stories.

Skips QA and proof on the assumption that:
- The change is small enough that a focused `review` catches issues.
- No UI changes (those route to `frontend-slice`).
- No new tests required beyond the ones the build agent adds.

Default file_scope expectation: a single source file or a tightly-related pair (source + its test).

### `plan-build-review` (default)

```
cycle:     plan → build × 5 → qa → review
finalizer: spec-gap → docs → spec-review → final-review → final-qa → proof → cleanup
triggers:  steer, merge_conflict, stuck_detected
```

The generic workflow. Used when nothing else fits or no explicit signal is present. Balanced: build iterations to handle multi-step implementation, QA + review per cycle for quality, full finalizer chain at completion.

### `frontend-slice`

```
cycle:     plan → frontend-build × 4 → qa → proof → review
finalizer: spec-gap → docs → spec-review → final-review → final-qa → proof → accessibility-check → cleanup
triggers:  steer, merge_conflict, stuck_detected, layout_regression
```

For: UI components, layout, styling, client state. Stories with file_scope under `src/components/**`, `src/styles/**`, `src/app/**`, `**/*.tsx` patterns.

Differences from default:
- Builder is `frontend` agent (CR #281), not generic `build`.
- Proof phase is in the cycle, not just finalizer — visual changes get screenshot evidence per iteration.
- Subagents `vision-reviewer`, `vision-comparator`, `accessibility-checker` available throughout.
- `layout_regression` trigger queues a layout-diff check when proof artifacts shift significantly.

### `backend-slice`

```
cycle:     plan → backend-build × 5 → integration → review
finalizer: spec-gap → docs → spec-review → contract-check → final-review → final-qa → cleanup
triggers:  steer, merge_conflict, stuck_detected, contract_mismatch
```

For: API endpoints, business logic, data access layers. Stories with file_scope under `src/api/**`, `src/lib/**`, `src/services/**`, `src/db/**`.

Differences from default:
- Builder is `backend` agent.
- Integration phase replaces QA — backend Stories test through HTTP/gRPC contracts rather than browser interaction.
- `contract_mismatch` trigger fires when the backend's surface diverges from the spec's contract definition; queues a contract-reconciliation prompt.

### `fullstack-slice`

```
cycle:     plan → frontend-build → backend-build → integration → qa → proof → review
finalizer: spec-gap → docs → spec-review → contract-check → final-review → final-qa → proof → cleanup
triggers:  steer, merge_conflict, stuck_detected, layer_misalignment
```

For: Stories spanning UI + API + sometimes DB. Cross-layer wiring is explicit.

Differences from frontend/backend slices:
- Two builders run sequentially per cycle: `frontend` then `backend`. Each is responsible for its layer.
- `integration` phase explicitly tests the wiring between layers.
- `layer_misalignment` trigger fires when frontend and backend changes disagree on a contract; queues a fullstack-coherence prompt.

Use sparingly — fullstack Stories are large. Prefer two coupled smaller Stories (one frontend, one backend, with a shared contract Story dispatched first) when the work decomposes cleanly.

### `refactor`

```
cycle:     plan → refactor-build → tests-still-pass → review
finalizer: spec-gap → final-review → cleanup
triggers:  steer, merge_conflict, stuck_detected, behavior_change_detected
```

For: structural changes that must NOT change behavior. Renames, extractions, file splits, dead-code removal, type tightening.

Differences from default:
- `tests-still-pass` is a hard gate phase: full test suite must pass without modifying tests. Test changes by the refactor builder fail this gate.
- `behavior_change_detected` trigger fires if any external observable (HTTP response, CLI output, file content) changes; queues a refine prompt to either restore behavior or escalate ("this isn't a refactor, it's a feature").
- No QA, no proof — refactors are invisible to users by definition.

### `migration`

```
cycle:     plan → migration-build → backwards-compat → integration → review
finalizer: spec-gap → docs → migration-rollback-plan → spec-review → final-review → final-qa → cleanup
triggers:  steer, merge_conflict, stuck_detected, rollback_path_unclear
```

For: breaking changes — schema migrations, API version bumps, library upgrades with surface-altering effects.

Differences from default:
- `backwards-compat` phase verifies the new version still works against old callers (or documents the deprecation path).
- `migration-rollback-plan` is a finalizer-only phase that produces a documented rollback procedure as a committed artifact.
- `rollback_path_unclear` trigger blocks merge until the orchestrator either gets a clear rollback or flags for human.

### `docs-only`

```
cycle:     plan → docs-build → docs-review
finalizer: spec-gap → final-review → cleanup
triggers:  steer, merge_conflict, stuck_detected
```

For: README updates, doc site changes, API doc generation, changelog edits. file_scope under `docs/**`, `**/*.md`, `**/*.mdx`.

Differences from default:
- No QA, no integration, no proof.
- `docs-build` agent is the `docs-generator` from `agents.md` Subagent catalog.
- `docs-review` is a tight reviewer pass focused on accuracy + style consistency, not the 9-gate review.

### `security-fix`

```
cycle:     plan → build → security-scan → integration → review
finalizer: spec-gap → docs → security-final-scan → final-review → final-qa → cleanup
triggers:  steer, merge_conflict, stuck_detected, vulnerability_introduced
```

For: CVE remediation, dependency vulnerability fixes, auth issues, secret exposure cleanup.

Differences from default:
- `security-scan` phase delegates to `security-scanner` subagent; finds new vulns introduced by the fix or related vulns missed by the original report.
- `security-final-scan` repeats with deeper analysis at finalizer.
- `vulnerability_introduced` trigger blocks merge on regression.

### `perf-opt`

```
cycle:     benchmark-baseline → plan → build → benchmark-after → review
finalizer: spec-gap → docs → perf-final-check → final-review → cleanup
triggers:  steer, merge_conflict, stuck_detected, regression_detected
```

For: latency reduction, throughput improvement, memory or bundle-size reduction with a measurable target.

Differences from default:
- `benchmark-baseline` runs first and records the starting metric.
- `benchmark-after` measures and compares; fails the cycle if no improvement.
- `regression_detected` trigger queues a refine prompt if other metrics worsen even when the target improves.

This workflow is the closest thing in v1 to AutoResearch (per `self-improvement.md` Level-3 forward-compat note). When richer iterative experimentation lands later, it slots in here.

## Workflow file structure

```yaml
# aloop/workflows/frontend-slice.yaml

name: frontend-slice
description: UI components, layout, styling, client state

cycle:
  - agent: plan
  - agent: frontend-build
    repeat: 4
    onFailure: retry
  - agent: qa
  - agent: proof
  - agent: review
    onFailure: goto frontend-build

finalizer:
  - PROMPT_spec-gap.md
  - PROMPT_docs.md
  - PROMPT_spec-review.md
  - PROMPT_final-review.md
  - PROMPT_final-qa.md
  - PROMPT_proof.md
  - PROMPT_accessibility-check.md
  - PROMPT_cleanup.md

triggers:
  steer:               PROMPT_steer.md
  merge_conflict:      PROMPT_merge.md
  stuck_detected:      PROMPT_debug.md
  layout_regression:   PROMPT_orch_layout-diff.md  # this one fires into orchestrator's queue

selection_hints:        # consumed by orch_refine, advisory only
  file_scope_patterns:
    - "src/components/**"
    - "src/styles/**"
    - "**/*.tsx"
    - "**/*.css"
  labels:
    - frontend
    - ui
  capabilities_required:
    - vision

defaults:
  provider_chain: [opencode, copilot, codex, claude, gemini]
  reasoning:
    plan: high
    frontend-build: medium
    qa: medium
    proof: medium
    review: xhigh
```

The compile step reads this and produces `loop-plan.json` for the session — same machinery as any workflow.

## Selection logic

Workflow choice happens during `orch_refine` (when Story scope is known). Selection follows a strict priority order:

1. **Explicit override.** If `Story.metadata.workflow` is set, use it. The author (human or upstream agent) gets the final say.

2. **Label match.** Map abstract labels to workflow names:
   - `frontend` → `frontend-slice`
   - `backend` → `backend-slice`
   - `fullstack` → `fullstack-slice`
   - `refactor` → `refactor`
   - `migration` → `migration`
   - `docs` → `docs-only`
   - `security` → `security-fix`
   - `perf` / `performance` → `perf-opt`

   Mapping in project `aloop/config.yml` `workflow.label_map`. Multiple matching labels — the orchestrator picks the most specific (refine prompt sees the conflict and chooses).

3. **File scope pattern match.** Each workflow's `selection_hints.file_scope_patterns` are evaluated against `Story.metadata.file_scope.owned`. First match wins; ties broken by specificity (longest-prefix wins).

4. **Complexity tier match.**
   - `S` → `quick-fix` (unless an above rule already routed it)
   - `XL` → `fullstack-slice` (unless an above rule already routed it)
   - `M` / `L` → no override, fall through.

5. **Default.** If nothing matches: `plan-build-review`.

Selection is logged: `Story.metadata.workflow_selection_trace = [{ rule: "label_match", value: "frontend" }, ...]`. Audit-friendly. The orchestrator can be challenged via human comment if a Story landed in the wrong workflow.

## Project overrides

Projects customize selection in `aloop/config.yml`:

```yaml
workflow:
  label_map:
    feature:    plan-build-review
    cleanup:    refactor
    research:   plan-build-review        # this team treats research as full-cycle
  default: plan-build-review
  routes:
    # explicit globs override the shipped patterns
    - when: "src/admin/**"
      workflow: backend-slice            # the admin panel is backend-only here
    - when: "infrastructure/**"
      workflow: migration                # infra changes always treated as migrations
  forbid:
    - quick-fix                          # this project requires QA on everything; never use quick-fix
```

The compile step validates: every workflow referenced exists; no `forbid` workflow is selectable; `default` is set. Errors surface during setup verification (`setup.md` Phase 6).

## Custom workflows

Projects add their own under `<project>/.aloop/workflows/<name>.yaml`. Schema is enforced at compile. Three rules:

1. **Reference only existing agents.** A workflow that names `agent: ml-tuner` requires the project to define `aloop/templates/PROMPT_ml-tuner.md` and a role for it in the agent permissions table (per `agents.md`).
2. **Triggers must be registered.** Every trigger keyword in the workflow must have a matching prompt file. Unknown triggers fail compile.
3. **Cycle must terminate.** Compile detects infinite `onFailure: goto` cycles and fails.

The CR workflow exists for projects to upstream useful custom workflows back to aloop.

## Invariants

1. **Workflow is a property of the Story, not the agent.** The same agent can run in different workflows; the workflow defines the surrounding choreography.
2. **Selection is deterministic and auditable.** Every workflow assignment carries a trace. No black-box "the orchestrator decided."
3. **The shipped catalog is opinionated but overridable.** Defaults reflect what works for most projects; projects with idiosyncratic needs override.
4. **No workflow secretly mutates aloop core.** All workflows operate within their `file_scope.owned` per `work-tracker.md` and CONSTITUTION §IX.
5. **Workflow files are agent-read-only by default.** Projects' own workflows are agent-writable only if the project explicitly extends file_scope to include `.aloop/workflows/`. The shipped catalog under `~/.aloop/workflows/` is never agent-writable.
