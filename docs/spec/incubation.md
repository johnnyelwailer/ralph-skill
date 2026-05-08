# Incubation

> **Reference document.** Incubation is a product mode over shared aloop primitives, not a separate backend subsystem. Hard rules live in `CONSTITUTION.md`. Work items live in GitHub issues only after promotion to the tracker.

## Role

Incubation is the pre-tracker, pre-implementation view of uncertain work:

- raw ideas, links, screenshots, voice notes, documents, logs, and pasted observations
- clarification threads and evidence gathering before setup, spec, Epic, Story, or steering
- background research, monitors, outreach drafts, and synthesis proposals
- explicit promotion into existing setup, spec, tracker, session, or decision-record primitives

Incubation answers: "What is this thought, what evidence do we have, and what could it become?"

It must not answer that by introducing a parallel object family. The durable objects are the same primitives used elsewhere in aloop:

| Incubation concern | Backing primitive |
|---|---|
| Captured idea or observation | `Artifact` with `kind`, `phase`, labels, provenance, and scope metadata |
| Discussion and clarification | shared comment primitive attached to the artifact, composer turn, setup run, work item, or session |
| Agentic intake conversation | `ComposerTurn` scoped to global, project, artifact, setup run, work item, session, or spec section |
| One-shot research | provider-backed `Session` or composer-delegated run with a non-mutating research workflow |
| Long-running monitor | `Trigger` whose action creates a research session/composer turn or alert artifact |
| Source records and citations | daemon artifacts plus event projections over the run that acquired them |
| Outreach draft, survey plan, interview script, response summary | artifacts with privacy/consent metadata and policy-gated adapter actions |
| Synthesis or decision record | artifact or spec/document proposal with evidence refs |
| Promotion | explicit mutation through setup, spec/document, tracker, or session APIs |
| Board/inbox/workstation row | query/view over artifacts, comments, triggers, sessions, and promotion refs |

There is no dedicated `/v1/incubation` API in v1. Clients implement an incubation inbox, kanban board, or workstation by querying the ordinary primitives with incubation-oriented filters.

## Lifecycle

Incubation state is view data, not a separate table. Store lifecycle as metadata on the primary artifact or proposal. The lifecycle vocabulary is:

```text
captured | clarifying | researching | synthesized | ready_for_promotion | promoted | discarded | archived
```

The state machine is advisory for humans and clients:

```text
captured
  -> clarifying
  -> researching
  -> synthesized
  -> ready_for_promotion
  -> promoted
  -> archived

captured | clarifying | researching | synthesized
  -> discarded
```

Promotion is still gated by the target subsystem. A Story promotion requires tracker/orchestrator readiness. A setup promotion requires setup readiness. A steering promotion requires the session steering policy. Incubation metadata cannot bypass those gates.

## Metadata Profile

The root object for capture is a normal artifact. Incubation does not define a standalone object model; it defines conventional metadata keys that clients and projectors may use to build incubation views.

```json
{
  "incubation": {
    "lifecycle": "captured",
    "scope": { "kind": "project", "project_id": "p_..." },
    "title": "Investigate mobile capture for aloop",
    "labels": ["product"],
    "priority": "normal",
    "source": {
      "client": "mobile-web",
      "captured_at": "2026-05-08T10:00:00.000Z",
      "author": "optional-human-or-client-id",
      "url": "https://example.com"
    },
    "related_artifact_ids": ["a_..."],
    "promoted_refs": []
  }
}
```

`scope.kind` is one of `global`, `workspace`, `project`, or `candidate_project`. The corresponding scope identifiers are ordinary references such as `workspace_id`, `project_id`, `abs_path`, or `repo_url`.

`promoted_refs` are backlinks to real targets. A target may be a setup run, spec change, Epic, Story, steering instruction, decision record, or discard decision. Each ref records the target id, promotion time, and evidence artifact ids.

Research protocols, source plans, outreach plans, monitor policies, and proposal previews are also ordinary artifacts. They should use typed metadata and stable artifact kinds/phases rather than new daemon tables.

## API Shape

Clients use existing endpoints:

- `/v1/artifacts` for capture, source records, research outputs, proposals, outreach drafts, and decision records
- shared comments endpoints for object-level discussion
- `/v1/composer/turns` for agentic intake, clarification, delegation, and status explanation
- `/v1/sessions` for provider-backed research workflows and experiment loops
- `/v1/triggers` for recurring monitors and event-triggered checks
- setup/spec/tracker/session endpoints for promotion targets
- `/v1/events` for replayable history, run progress, citations, scheduler decisions, and promotion audit

Per CONSTITUTION §V.24, new incubation requirements map to shared primitives. When the current primitives are too narrow, the required change is a generic primitive enhancement such as a typed subtype, metadata profile, relation model, session mode, or trigger action shape.

## Execution Model

Incubation reuses aloop's daemon discipline:

- the daemon owns artifacts, comments, turns, sessions, triggers, events, and retention
- composer kickoff is just a client path into those objects
- background research uses provider adapters and scheduler permits
- permits are owned by the research session, composer turn, or control subagent run
- every research session emits durable events and artifacts
- source acquisition uses the runtime extension manifest model from `pipeline.md`
- experiment attempts run through the existing sandbox adapter and deterministic exec-step path
- outreach integrations are ordinary daemon adapters with policy tables
- agents express intent; the daemon performs mutations and promotions under target policy

Incubation does not create implementation worktrees by default.

## Research

A one-shot research task is a normal provider-backed run configured with a research workflow. The run may read the capture artifact, comments, attached media, selected project files, setup outputs, and policy-approved external sources.

Research output should be evidence-first:

- concise answer
- cited findings or source references
- open questions
- risks and unknowns
- suggested next actions
- candidate promotion targets

Research modes are workflow/config values, not table types:

| Mode | Use | Primary output |
|---|---|---|
| `source_synthesis` | source gathering and cited synthesis | findings, source records, proposal candidates |
| `monitor_tick` | recurring market/ecosystem/source tracking | delta digest, alert, no-change record |
| `outreach_analysis` | survey/interview response analysis | anonymized response synthesis, proposal candidates |
| `experiment_loop` | active experimentation against an immutable oracle | attempt ledger, best candidate, rejected attempts |

## Monitors

A monitor is a trigger profile plus a research protocol artifact. Each tick creates a normal research session/composer turn or alert artifact. Monitors do not mutate project, tracker, spec, or session state directly.

Required monitor metadata:

- cadence or event trigger
- debounce policy
- source plan
- budget cap per fire
- stop conditions
- synthesis policy
- target artifact/project/workspace scope

Monitor scheduling is backed by `/v1/triggers`; it must not have a special watchdog table.

## Outreach

Outreach is a governed artifact and adapter workflow:

- agents may draft survey plans, interview scripts, outreach messages, respondent-list requirements, consent text, and response summaries
- agents may not send messages, post publicly, DM accounts, buy ads, scrape personal contact data, or impersonate the user
- sending or publishing requires explicit human approval through a configured adapter or manual export
- personal data classification, consent, source of contact list, and retention policy must be recorded as artifact metadata

Outbound contact is never a raw agent side channel.

## Promotion

Promotion is an explicit apply action through the existing target subsystem:

| Target | Effect |
|---|---|
| `setup_run` | creates or updates a setup run |
| `spec_change` | creates a reviewable spec/document proposal |
| `epic` | creates an Epic through the tracker adapter |
| `story` | creates a Story under normal tracker/orchestrator readiness gates |
| `steering` | queues a steering instruction against a selected session |
| `decision_record` | stores a durable decision note artifact |
| `discard` | marks the source artifact/proposal as discarded |

The target records a backlink to the source artifact and evidence. The source artifact records `promoted_refs`. Promotion is never a hidden side effect of research completion.

## Client Surfaces

The dashboard may expose an incubation inbox, kanban board, monitor list, research queue, proposal review, or mobile capture flow. Those are views over shared primitives:

- artifacts filtered by incubation metadata
- comments and artifact refs
- composer turns and delegated runs
- triggers scoped to monitor profiles
- sessions running research workflows
- promotion refs and target state

The UI can call the view "Incubation", but the backend should remain ordinary primitives plus configuration.

## Invariants

1. Incubation is a view/profile over shared primitives, not a separate storage or route family.
2. No dedicated `/v1/incubation` endpoint exists in v1.
3. Primitive gaps become generic daemon capabilities, not incubation-specific code paths.
4. Useful ideas, research, comments, proposals, and decisions are daemon-owned artifacts/events/comments/turns, not browser-local chat state.
5. Research is non-mutating by default.
6. Promotion is explicit and routed through the target subsystem.
7. Provenance is preserved through source artifact refs, evidence refs, events, and target backlinks.
8. Vague ideas do not become Epics or Stories until target readiness gates pass.
9. Background research consumes provider permits like any other provider-backed work.
10. External acquisition is source-planned, cited, rate-limited, and policy-controlled.
11. Monitors are trigger profiles with bounded budgets and stop conditions.
12. Outreach requires approval, consent/privacy metadata, and an adapter policy before outbound contact.
