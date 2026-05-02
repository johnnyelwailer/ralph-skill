# Roadmap Prioritization

> Working document for implementation order. This complements `DELIVERY_PLAN.md`: the delivery plan is the dependency graph; this document explains the priority rationale and the product slices that should receive focus first.

## Executive direction

Prioritize the runtime around the autonomous loop first, then make hosted sandbox execution the first serious execution backend.

The intended order is:

1. Core loop runtime
2. Basic primitives
3. Orchestrator
4. Azure hosted service and sandboxes
5. Local runtime polish

This deliberately treats local execution as a development and compatibility path, not as the architectural center. If the product is meant to run hosted workloads on Azure sandboxes, the runtime should be designed around execution abstraction from the start.

## Prioritization principles

1. **Loop before surface area.** Aloop/Ralph is valuable only when the plan/build/review loop can run, validate, persist state, and recover.
2. **Primitives before features.** Features should compose from stable concepts such as Session, Turn, Workflow, Provider, Sandbox, Permit, Event, and WorkItem.
3. **Hosted execution shapes the architecture.** Sandbox lifecycle, streaming, artifact transfer, identity, policy, and teardown are first-class runtime concerns.
4. **One vertical slice beats broad partials.** One provider, one workflow, one sandbox backend, and one tracker path end-to-end is more important than breadth.
5. **Backpressure is product behavior.** Tests, lints, builds, typechecks, policy gates, and cost gates are not implementation details; they are how the system stays honest.
6. **Everything important emits events.** Runtime state must be observable, replayable, and resumable.

## P0 - Runtime contracts and invariants

Define the contracts that everything else depends on.

Primary outputs:

- Runtime object model and state machine
- Event taxonomy
- Session lifecycle contract
- Workflow phase contract
- Provider adapter contract
- Sandbox adapter contract
- Scheduler/permit contract
- Validation/backpressure contract
- Policy boundaries between agent intent and daemon authority

Key decision:

The daemon owns authority. Agents express intent through structured outputs and tools; the runtime validates and executes under policy.

## P1 - Core loop runtime and primitives

Build the smallest runtime that can execute a real loop.

Focus areas:

- `Project`
- `Session`
- `Turn`
- `Workflow`
- `Phase`
- `Provider`
- `Sandbox`
- `Permit`
- `Validation`
- `Event`
- `Artifact`

Acceptance shape:

- Start a session from a compiled workflow.
- Execute plan/build/review turns.
- Persist every meaningful state transition.
- Stream live events.
- Recover enough state after restart to explain what happened.
- Fail closed when validation, provider execution, or policy checks fail.

Why this comes first:

Without this, orchestrator, hosted execution, provider breadth, dashboard, and tracker integrations are all building on unstable ground.

## P2 - Sandbox abstraction and Azure execution

Make sandboxed execution a core runtime boundary before investing in local runtime polish.

Focus areas:

- `SandboxAdapter` lifecycle:
  - create
  - prepare inputs
  - upload files/artifacts
  - execute command/turn
  - stream logs/events
  - fetch outputs/artifacts
  - terminate
  - destroy
- Azure Container Apps Jobs backend
- Managed identity model
- Secret and environment sanitization
- Per-session isolation
- Timeout and retry semantics
- Result envelope returned to the daemon

Acceptance shape:

- The runtime can submit one session turn to an Azure sandbox.
- Logs stream back or are pollable through a stable adapter API.
- Outputs are retrieved in a structured result envelope.
- Failed jobs produce classified runtime failures.
- Credentials are not baked into images.

Why this comes before local runtime polish:

The hosted backend will force the right boundaries: no hidden local filesystem assumptions, no privileged provider shortcuts, no daemon-only execution path that cannot be moved later.

## P3 - Hosted control plane and scheduler

Build the durable service that coordinates sessions and sandboxes.

Focus areas:

- HTTP/SSE API
- Durable state store
- Event log and replay
- Scheduler permits
- Provider capacity and quota gates
- Sandbox capacity gates
- Cost/burn-rate gates
- Project/session registry
- Crash recovery and stale session detection

Acceptance shape:

- A remote session can be created, observed, stopped, and resumed.
- Every turn acquires a permit before execution.
- The scheduler can deny work for explicit, inspectable reasons.
- Session and permit state survives process restart.

## P4 - Orchestrator vertical slice

Build the first version of autonomous decomposition and child dispatch.

Focus areas:

- Orchestrator as a normal session kind
- Spec-to-Epic decomposition
- Epic-to-Story decomposition
- Child session dispatch
- Child session monitoring
- Basic review and close/merge decision
- Builtin tracker path for offline operation

Acceptance shape:

- Given a small spec, the orchestrator creates several Stories.
- It dispatches child sessions through the same scheduler and sandbox path as ordinary sessions.
- Child outputs are reviewed and recorded.
- The work item state changes are evented and inspectable.

Why this is after hosted sandbox foundations:

The orchestrator multiplies execution. If execution isolation, permits, and results are weak, orchestration will amplify those weaknesses.

## P5 - Provider breadth and quota intelligence

Expand beyond the first provider only after the runtime can run real work.

Focus areas:

- Provider chain grammar
- Failure classification
- Per-turn fallthrough
- Provider health state
- Quota probes where providers expose them
- Backoff when providers do not expose reset times
- Usage and cost aggregation

Acceptance shape:

- A provider failure can fall through to the next provider in chain.
- Quota/cooldown state affects permit decisions.
- Cost and usage are attributed to session and work item.

## P6 - Tracker and change-set workflow

Make external work tracking and merge flow production-grade.

Focus areas:

- Builtin tracker hardening
- GitHub tracker adapter
- WorkItem abstraction
- ChangeSet abstraction
- Branch/change-set lifecycle
- Review comments and findings
- Merge policy
- Audit events

Acceptance shape:

- Orchestrator can operate against builtin tracker offline.
- Orchestrator can operate against GitHub with native issue/sub-issue concepts.
- Children cannot merge directly when policy forbids it.
- Merge actions are auditable.

## P7 - Dashboard and operator UX

Build the human operating surface after the runtime behavior is meaningful.

Focus areas:

- Session list and detail
- Live event tail
- Provider health
- Scheduler permits
- Sandbox/job status
- Cost and burn rate
- Steering
- Stop/resume
- Override editor

Acceptance shape:

- A user can understand what is running, what is blocked, what failed, and what it costs.
- A user can steer or stop a session without using internal tools.

## P8 - Local runtime polish and install story

Make the local path pleasant after the hosted-first boundaries are proven.

Focus areas:

- Local sandbox adapter
- Devcontainer adapter if retained
- CLI install/uninstall
- launchd/systemd/NSSM service setup
- Local diagnostics
- Offline smoke tests

Acceptance shape:

- A fresh clone can install and run locally.
- Local execution uses the same runtime contracts as Azure execution.
- Local-only behavior is treated as an adapter detail, not a parallel product.

## Important cross-cutting work

These are not separate late-stage features; they should be threaded through the priorities above.

- **Security:** policy enforcement, identity boundaries, secret stripping, sandbox isolation.
- **Observability:** structured events, logs, replay, status endpoints, failure classification.
- **Validation:** tests, typechecks, lint, build, acceptance gates, proof artifacts.
- **Resumability:** session state, permit reclamation, interrupted turn handling.
- **Configuration:** project config, workflow config, provider config, hosted service config.
- **Research log:** durable notes for external discoveries and design decisions.
- **Constitution enforcement:** LOC budgets, file boundaries, test requirements, and non-bypassable runtime rules.

## Near-term implementation focus

The next concrete implementation slice should be:

1. Write the runtime contracts for Session, Turn, Workflow, Provider, Sandbox, Permit, Event, and Validation.
2. Implement a minimal loop runner against those contracts.
3. Add one provider adapter and one fake/in-memory sandbox adapter for deterministic tests.
4. Add the Azure sandbox adapter behind the same interface.
5. Prove one plan/build/review session can run through the hosted sandbox path.
6. Only then expand to orchestrator dispatch.

This gives the project a clear spine: core runtime, real sandbox execution, durable coordination, then autonomous orchestration.
