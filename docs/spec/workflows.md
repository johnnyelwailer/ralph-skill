# Workflows

> **Reference document.** The shipped workflow catalog and the rules for selecting one per Story. A workflow is data — a YAML file describing trigger-keyed `on:` handlers, handler-local pipelines/finalizers, and per-step agent/exec assignments. The daemon executes any workflow uniformly. This document specifies the ones that ship and how the orchestrator picks the right one for each Story. Hard rules live in [docs/CONSTITUTION.md](../CONSTITUTION.md). Work items live in GitHub issues.
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

The catalog contains two ordinary workflow shapes:

- **Story workflows** run in `kind: child` or `kind: standalone` sessions and execute one bounded Story.
- **Orchestrator workflows** run in `kind: orchestrator` sessions and keep producing, refining, dispatching, reviewing, and merging Stories.

Both shapes use the same YAML format, runner, scheduler permits, event handlers, provider chains, and prompt contracts. The difference is only the session kind and agent catalog selected by the workflow.

This is a hard design rule: orchestration is not a new product concept, runtime, subsystem, or API lane. It is just another workflow over the same primitives: sessions, event handlers, prompts, trigger records, queue entries, scheduler permits, artifacts, tracker work items, change sets, and daemon events. New long-running behaviors should be modeled as workflow files and prompt/catalog additions before adding any daemon concept.

### `orchestrator`

```
on.start.pipeline:  orch_scan → orch_consistency → orch_dispatch
on.<event>:         decompose_needed, refine_needed, estimate_needed,
                    pr_review_needed, merge_conflict_pr, child_stuck,
                    burn_rate_alert, user_comment
event sources:      tracker change, child event, scheduler alert, human comment
```

For: feature/spec delivery. It keeps the live Epic/Story decomposition aligned with the project's spec, dispatches ready Stories to child workflows, reviews change sets, merges approved work into `agent/trunk`, and reacts to comments or anomalies.

This is the default long-running orchestrator workflow for projects that are still building new scoped functionality from a spec.

### `maintenance-loop`

```
on.start:  omitted
handlers:  dependency_signal, coverage_signal, docs_signal, demo_signal,
           refactor_signal, bug_signal, maintenance_sweep_requested,
           decompose_needed, refine_needed, estimate_needed, pr_review_needed,
           merge_conflict_pr, child_stuck, burn_rate_alert, user_comment
events:    normalized dependency-tool signal, coverage signal, docs drift signal,
           demo drift signal, refactor signal, bug signal, tracker change, child event,
           scheduler alert, human comment
```

For: long-running repository maintenance after the project is already in useful shape.

It is intentionally not a new mode, daemon, or subsystem. It is an orchestrator workflow profile that reuses the same aloop workflow format and dispatches ordinary Stories through the existing Story workflows below.

The maintenance loop is event-driven by default. If no issues are created, no change sets are opened, no commits land, no dependency-tool signals arrive, and no other normalized runtime inputs fire, it should not spend provider tokens looking for work. Any relevant event may start a long refinement/dispatch/review cycle when its impact and complexity justify it.

Maintenance discovery is split by responsibility so each agent has clean context:

- `orch_maintenance_dependencies` — dependencies, lockfiles, generated artifacts, toolchain drift, and normalized external dependency-tool change sets
- `orch_maintenance_tests` — test coverage targets, flaky/skipped/weak tests, testability gaps
- `orch_maintenance_docs` — README, docs, API docs, examples, comments, changelog drift
- `orch_maintenance_demos` — demos, examples, previews, fixtures, Storybook stories and states
- `orch_maintenance_refactor` — behavior-preserving structural improvements driven by constitution factors
- `orch_maintenance_bugs` — bug reports, regressions, crashes, support reports, CI or production failures

Category handlers run only when a matching signal is emitted:

- `dependency_signal` → `orch_maintenance_dependencies`
- `coverage_signal` → `orch_maintenance_tests`
- `docs_signal` → `orch_maintenance_docs`
- `demo_signal` → `orch_maintenance_demos`
- `refactor_signal` → `orch_maintenance_refactor`
- `bug_signal` → `orch_maintenance_bugs`
- `maintenance_sweep_requested` → all maintenance agents; intended for explicit human request or coarse scheduled health checks, not the default idle path

Signals are produced by daemon/runtime projections, tracker events, external-tool adapters, child-session events, or explicit human steering. Maintenance prompts consume the normalized signal context; they do not call external APIs directly.

Canonical maintenance signal sources:

| Signal | Typical source topics | Examples |
|---|---|---|
| `dependency_signal` | `change_set.opened`, `change_set.updated`, `external.dependency.update`, `external.security.alert`, `dependency.outdated`, `dependency.lockfile_drift` | Dependabot-style PR, npm audit alert, lockfile changed after manifest edit |
| `coverage_signal` | `coverage.changed`, `coverage.below_target`, `test.flaky`, `test.skipped`, `test.weak_area`, `session.completed` | Coverage drops after a commit, flaky suite detected, skipped tests accumulate |
| `docs_signal` | `docs.drift`, `api.surface_changed`, `cli.help_changed`, `work_item.closed`, `change_set.merged` | Public API changed without docs, README example stale after merge |
| `demo_signal` | `demo.drift`, `storybook.coverage_gap`, `ui.component_changed`, `artifact.proof.created` | Component changed with missing Storybook state, demo fixture stale |
| `refactor_signal` | `quality.refactor_candidate`, `review.finding.created`, `complexity.threshold_exceeded`, `ownership.hotspot` | File grows past threshold, review repeatedly flags coupling |
| `bug_signal` | `work_item.created`, `work_item.updated`, `external.bug_report`, `ci.regression`, `runtime.crash`, `support.report` | Tracker issue labeled bug, CI regression report, production crash |

The source topics above are normalized daemon events, not prompt-visible tracker APIs. A GitHub PR, GitLab MR, Dependabot alert, Sentry crash, CI failure, or custom webhook must first be translated by an adapter, projector, or external producer into a bounded aloop event. The maintenance workflow sees only that normalized event and the curated context attached to it.

There are no hardcoded maintenance trigger implementations. The shipped handler names above are workflow queue targets. Any code that can authenticate to the daemon may create a durable trigger through `/v1/triggers`, or may emit a normalized event through a typed runtime extension/adapter that durable trigger records match.

External trigger producers use generic primitives:

- event topic, e.g. `external.bug_report`
- normalized labels, e.g. `{source: "sentry", component: "payments"}`
- object refs, e.g. work item, change set, commit, artifact, project, session
- evidence refs, e.g. logs, screenshots, failing test output, security advisory
- severity/impact fields where applicable

A trigger record then maps those generic fields to a workflow handler via `queue_workflow_handler`. For example, an external Sentry adapter can emit `external.bug_report` with `component=payments`; a trigger record created through the API can match that event and queue `bug_signal`. No prompt or workflow needs to know Sentry exists.

Custom triggers may only queue existing workflow handler names unless the project also provides a custom workflow handler and prompt template. Trigger predicates stay in daemon-owned trigger records; prompts receive the already-matched signal context and do not evaluate arbitrary event expressions.

The maintenance agents look for bounded, behavior-preserving maintenance work within the category that woke them:

- keeping dependencies and generated artifacts up to date
- raising or preserving configured test coverage targets
- keeping README, docs, API docs, comments, examples, demos, and Storybook stories consistent with code
- improving demo and story coverage for relevant states and edge cases
- splitting or reshaping code only when that makes tests, docs, or reviewability better
- filing follow-up Stories for larger work instead of silently expanding scope

Maintenance work still becomes normal Epics and Stories before dispatch. The selected child workflow depends on the Story:

- dependency upgrades with compatibility risk use `migration`
- existing dependency-tool change sets, such as Dependabot-style PRs surfaced through runtime events, go through normal orchestrator change-set review before any follow-up child work is created
- behavior-preserving structure changes use `refactor`
- tests and coverage work use `plan-build-review` unless file scope or labels route more specifically
- docs drift uses `docs-only`
- UI demo and Storybook work uses `frontend-slice`
- security/dependency remediation uses `security-fix`
- performance upkeep uses `perf-opt`

The workflow must not invent product functionality. If maintenance discovers missing behavior, unclear public API expectations, or a product decision, it files or refines a normal Story and leaves it below `dor_validated` until the decision is clear.

### `quick-fix`

```
on.start.pipeline:  plan → build → review
on.start.finalizer: spec-gap → docs → final-review → cleanup
on.<event>:         steer, merge_conflict, stuck_detected
```

For: single-file fixes, small refactors, S-tier complexity Stories.

Skips QA and proof on the assumption that:
- The change is small enough that a focused `review` catches issues.
- No UI changes (those route to `frontend-slice`).
- No new tests required beyond the ones the build agent adds.

Default file_scope expectation: a single source file or a tightly-related pair (source + its test).

### `plan-build-review` (default)

```
on.start.pipeline:  plan → build × 5 → qa → review
on.start.finalizer: spec-gap → docs → spec-review → final-review → final-qa → proof → cleanup
on.<event>:         steer, merge_conflict, stuck_detected
```

The generic workflow. Used when nothing else fits or no explicit signal is present. Balanced: build iterations to handle multi-step implementation, QA + review per cycle for quality, full finalizer chain at completion.

### `frontend-slice`

```
on.start.pipeline:  plan → frontend-build × 4 → qa → proof → review
on.start.finalizer: spec-gap → docs → spec-review → final-review → final-qa → proof → accessibility-check → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, layout_regression
```

For: UI components, layout, styling, client state. Stories with file_scope under `src/components/**`, `src/styles/**`, `src/app/**`, `**/*.tsx` patterns.

Differences from default:
- Builder is `frontend` agent (CR #281), not generic `build`.
- Proof phase is in the cycle, not just finalizer — visual changes get screenshot evidence per iteration.
- Subagents `vision-reviewer`, `vision-comparator`, `accessibility-checker` available throughout.
- `layout_regression` trigger queues a layout-diff check when proof artifacts shift significantly.

### `backend-slice`

```
on.start.pipeline:  plan → backend-build × 5 → integration → review
on.start.finalizer: spec-gap → docs → spec-review → contract-check → final-review → final-qa → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, contract_mismatch
```

For: API endpoints, business logic, data access layers. Stories with file_scope under `src/api/**`, `src/lib/**`, `src/services/**`, `src/db/**`.

Differences from default:
- Builder is `backend` agent.
- Integration phase replaces QA — backend Stories test through HTTP/gRPC contracts rather than browser interaction.
- `contract_mismatch` trigger fires when the backend's surface diverges from the spec's contract definition; queues a contract-reconciliation prompt.

### `fullstack-slice`

```
on.start.pipeline:  plan → frontend-build → backend-build → integration → qa → proof → review
on.start.finalizer: spec-gap → docs → spec-review → contract-check → final-review → final-qa → proof → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, layer_misalignment
```

For: Stories spanning UI + API + sometimes DB. Cross-layer wiring is explicit.

Differences from frontend/backend slices:
- Two builders run sequentially per cycle: `frontend` then `backend`. Each is responsible for its layer.
- `integration` phase explicitly tests the wiring between layers.
- `layer_misalignment` trigger fires when frontend and backend changes disagree on a contract; queues a fullstack-coherence prompt.

Use sparingly — fullstack Stories are large. Prefer two coupled smaller Stories (one frontend, one backend, with a shared contract Story dispatched first) when the work decomposes cleanly.

### `refactor`

```
on.start.pipeline:  plan → refactor-build → tests-still-pass → review
on.start.finalizer: spec-gap → final-review → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, behavior_change_detected
```

For: structural changes that must NOT change behavior. Renames, extractions, file splits, dead-code removal, type tightening.

Differences from default:
- `tests-still-pass` is a hard gate phase: full test suite must pass without modifying tests. Test changes by the refactor builder fail this gate.
- `behavior_change_detected` trigger fires if any external observable (HTTP response, CLI output, file content) changes; queues a refine prompt to either restore behavior or escalate ("this isn't a refactor, it's a feature").
- No QA, no proof — refactors are invisible to users by definition.

### `migration`

```
on.start.pipeline:  plan → migration-build → backwards-compat → integration → review
on.start.finalizer: spec-gap → docs → migration-rollback-plan → spec-review → final-review → final-qa → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, rollback_path_unclear
```

For: breaking changes — schema migrations, API version bumps, library upgrades with surface-altering effects.

Differences from default:
- `backwards-compat` phase verifies the new version still works against old callers (or documents the deprecation path).
- `migration-rollback-plan` is a finalizer-only phase that produces a documented rollback procedure as a committed artifact.
- `rollback_path_unclear` trigger blocks merge until the orchestrator either gets a clear rollback or flags for human.

### `docs-only`

```
on.start.pipeline:  plan → docs-build → docs-review
on.start.finalizer: spec-gap → final-review → cleanup
on.<event>:         steer, merge_conflict, stuck_detected
```

For: README updates, doc site changes, API doc generation, changelog edits. file_scope under `docs/**`, `**/*.md`, `**/*.mdx`.

Differences from default:
- No QA, no integration, no proof.
- `docs-build` agent is the `docs-generator` from `agents.md` Subagent catalog.
- `docs-review` is a tight reviewer pass focused on accuracy + style consistency, not the 9-gate review.

### `security-fix`

```
on.start.pipeline:  plan → build → security-scan → integration → review
on.start.finalizer: spec-gap → docs → security-final-scan → final-review → final-qa → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, vulnerability_introduced
```

For: CVE remediation, dependency vulnerability fixes, auth issues, secret exposure cleanup.

Differences from default:
- `security-scan` phase delegates to `security-scanner` subagent; finds new vulns introduced by the fix or related vulns missed by the original report.
- `security-final-scan` repeats with deeper analysis at finalizer.
- `vulnerability_introduced` trigger blocks merge on regression.

### `perf-opt`

```
on.start.pipeline:  benchmark-baseline → plan → build → benchmark-after → review
on.start.finalizer: spec-gap → docs → perf-final-check → final-review → cleanup
on.<event>:         steer, merge_conflict, stuck_detected, regression_detected
```

For: latency reduction, throughput improvement, memory or bundle-size reduction with a measurable target.

Differences from default:
- `benchmark-baseline` runs first and records the starting metric.
- `benchmark-after` measures and compares; fails the cycle if no improvement.
- `regression_detected` trigger queues a refine prompt if other metrics worsen even when the target improves.

This workflow is the closest thing in v1 to AutoResearch (per `self-improvement.md` Level-3 forward-compat note). When richer iterative experimentation lands later, it slots in here.

## Workflow file structure

Workflow files are trigger-keyed. The top-level shape is `on:`, and every key under `on` is a workflow event handler. There is no separate top-level `pipeline`, `finalizer`, or `triggers` block in the workflow catalog format.

The conventional start/cycle handler is `on.start`. Event-driven workflows, such as `maintenance-loop`, may omit `start` entirely and only define named event handlers.

Pipeline and finalizer phases do not carry prompt filenames directly; names resolve by convention (`agent: review` -> `PROMPT_review.md`, `exec: cleanup` -> `EXEC_cleanup.json`) during compile. External triggers are durable daemon records created through `/v1/triggers` or by runtime code using the daemon API; when they fire, they queue one of the handler names under `on:`.

```yaml
# aloop/workflows/frontend-slice.yaml

on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - agent: frontend-build
        repeat: 4
        onFailure: retry
      - agent: qa
      - agent: proof
      - agent: review
        onFailure: goto frontend-build
    finalizer:
      - agent: spec-gap
      - agent: docs
      - agent: spec-review
      - agent: final-review
      - agent: final-qa
      - agent: proof
      - agent: accessibility-check
      - exec: cleanup

  steer:
    pipeline:
      - agent: steer

  merge_conflict:
    pipeline:
      - agent: merge

  stuck_detected:
    pipeline:
      - agent: debug

  layout_regression:
    pipeline:
      - agent: layout-diff
```

The compile step reads this and produces handler plans for the session. `repeat` expands into multiple steps, `onFailure` is stored in compiled transition metadata, and event handler keys remain queue targets used by the trigger engine.

Metadata used to select a workflow, such as labels, file-scope patterns, or required capabilities, lives in project config / catalog metadata, not inside this compiled pipeline source. Provider defaults and reasoning defaults likewise come from daemon/project config or prompt frontmatter; the workflow file is choreography only.

Event-driven orchestrator workflows use the same format. They just omit `on.start` when they should remain dormant until an event arrives:

```yaml
# aloop/workflows/maintenance-loop.yaml

on:
  dependency_signal:
    pipeline:
      - agent: orch_maintenance_dependencies
      - agent: orch_consistency
      - agent: orch_dispatch

  bug_signal:
    pipeline:
      - agent: orch_maintenance_bugs
      - agent: orch_consistency
      - agent: orch_dispatch

  maintenance_sweep_requested:
    pipeline:
      - agent: orch_maintenance_dependencies
      - agent: orch_maintenance_tests
      - agent: orch_maintenance_docs
      - agent: orch_maintenance_demos
      - agent: orch_maintenance_refactor
      - agent: orch_maintenance_bugs
      - agent: orch_consistency
      - agent: orch_dispatch
```

Event-handler keys are handler names, not expressions. A handler is dormant until the daemon queues that event into the orchestrator session.

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

3. **File scope pattern match.** The catalog/project workflow routing metadata is evaluated against `Story.metadata.file_scope.owned`. First match wins; ties broken by specificity (longest-prefix wins).

4. **Complexity tier match.**
   - `S` → `quick-fix` (unless an above rule already routed it)
   - `XL` → `fullstack-slice` (unless an above rule already routed it)
   - `M` / `L` → no override, fall through.

5. **Default.** If nothing matches: `plan-build-review`.

Selection is logged: `Story.metadata.workflow_selection_trace = [{ rule: "label_match", value: "frontend" }, ...]`. Audit-friendly. The orchestrator can be challenged via human comment if a Story landed in the wrong workflow.

`maintenance-loop` is selected for an orchestrator session, not for an individual child Story. Inside a maintenance loop, each generated Story still receives a normal child workflow through the same selection rules above.

For orchestrator session creation, project or user intent may choose `workflow: maintenance-loop` explicitly, or route abstract project labels such as `maintenance`, `upkeep`, and `repo-health` to that workflow. That routing is session selection, not Story workflow selection.

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

Benchmarking is orthogonal to workflow selection. A benchmark candidate should normally reuse the exact workflow the canonical Story would have used; "benchmark" is not itself a special workflow in v1. If a project wants a benchmark-specific judge or rubric phase, it adds that as an ordinary custom workflow or finalizer prompt rather than as daemon-side benchmark logic.

## Custom workflows

Projects add their own under `<project>/.aloop/workflows/<name>.yaml`. Schema is enforced at compile. Three rules:

1. **Reference only existing agents.** A workflow that names `agent: ml-tuner` requires the project to define `aloop/templates/PROMPT_ml-tuner.md` and a role for it in the agent permissions table (per `agents.md`).
2. **Handlers must resolve.** Every `on.<handler>` pipeline step must resolve to an existing prompt or exec manifest. Unknown handlers or unresolved steps fail compile.
3. **Cycle must terminate.** Compile detects infinite `onFailure: goto` cycles and fails.

The CR workflow exists for projects to upstream useful custom workflows back to aloop.

## Invariants

1. **Workflow is a property of the Story, not the agent.** The same agent can run in different workflows; the workflow defines the surrounding choreography.
2. **Selection is deterministic and auditable.** Every workflow assignment carries a trace. No black-box "the orchestrator decided."
3. **The shipped catalog is opinionated but overridable.** Defaults reflect what works for most projects; projects with idiosyncratic needs override.
4. **No workflow secretly mutates aloop core.** All workflows operate within their `file_scope.owned` per `work-tracker.md` and CONSTITUTION §IX.
5. **Workflow files are agent-read-only by default.** Projects' own workflows are agent-writable only if the project explicitly extends file_scope to include `.aloop/workflows/`. The shipped catalog under `~/.aloop/workflows/` is never agent-writable.
