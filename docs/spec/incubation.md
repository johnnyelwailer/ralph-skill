# Incubation

> **Reference document.** The capture, research, synthesis, and promotion layer that exists before setup, specification, or implementation work. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues only after promotion to the tracker.

## Table of contents

- Role
- Lifecycle
- Object model
- Execution model
- Research runs
- Source acquisition
- Experiment loops
- Long-running monitors
- Active outreach and surveys
- Synthesis and proposals
- Promotion targets
- Client surfaces
- Relationship to setup, tracker, and sessions
- Retention
- Invariants

---

## Role

Incubation is the durable place for work that is not ready to become project setup, a spec edit, an Epic, or a Story.

It covers:

- fast capture from phone, browser, desktop, CLI, or composer surfaces
- vague ideas that need clarification over time
- links, screenshots, images, audio, voice notes, transcripts, videos, documents, logs, or pasted observations
- background research tasks that should produce evidence before any implementation
- multi-source research across documentation, papers, videos, forums, social feeds, repositories, issue trackers, market data, and uploaded artifacts
- long-running tracking tasks that watch how a market, technology, project, competitor, regulation, or community discussion develops
- tightly governed outreach tasks such as survey drafts, interview scripts, respondent lists, and human-approved contact workflows
- synthesis into reviewable proposals
- promotion into setup, specs, tracker work, or session steering only when ready

The core product boundary is:

- **incubation** answers: "What is this thought, what evidence do we have, and what could it become?"
- **setup** answers: "Do we understand this project enough to run aloop safely?"
- **orchestrator/tracker** answers: "What implementation work should run next?"
- **sessions** answer: "Execute this bounded work under workflow and scheduler control."

Incubation is not a second tracker. It is the pre-tracker intake and maturation layer.

## Lifecycle

An incubation item moves through a small state machine:

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

State meanings:

| State | Meaning |
|---|---|
| `captured` | Raw input exists; no durable interpretation yet. |
| `clarifying` | The system or user is resolving intent, scope, or target project. |
| `researching` | One or more non-mutating research runs are active or pending. |
| `synthesized` | Research and discussion have been condensed into a proposal or decision record. |
| `ready_for_promotion` | The item has at least one concrete promotion target. |
| `promoted` | A setup run, spec proposal, work item, or steering instruction was created from it. |
| `discarded` | The item was intentionally closed without promotion. |
| `archived` | Retained for history but hidden from active surfaces. |

The state machine is advisory for humans and clients, but promotion is gated by concrete target-specific validation. For example, promotion to a Story still requires the tracker adapter and orchestrator refinement rules; promotion to setup still requires setup readiness.

## Object model

The root object is `IncubationItem`.

```ts
type IncubationScope =
  | { kind: "global" }
  | { kind: "project"; project_id: string }
  | { kind: "candidate_project"; abs_path?: string; repo_url?: string };

type IncubationItem = {
  _v: 1;
  id: string;
  scope: IncubationScope;
  title: string;
  body: string;
  state:
    | "captured"
    | "clarifying"
    | "researching"
    | "synthesized"
    | "ready_for_promotion"
    | "promoted"
    | "discarded"
    | "archived";
  labels: string[];
  priority?: "low" | "normal" | "high";
  source: {
    client: string;                 // dashboard, mobile-web, cli, telegram, browser-extension, etc.
    captured_at: string;
    author?: string;
    url?: string;
  };
  links: {
    project_id?: string;
    artifact_ids?: string[];
    related_item_ids?: string[];
    promoted_refs?: PromotionRef[];
  };
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
```

Comments, attachments, inline images, transcripts, PDFs, videos, and other media reuse the same artifact/comment primitives used elsewhere in aloop. Clients must not store useful discussion only in local browser state.

Incubation may also own recurring or continuous objects tied to the item:

```ts
type ResearchMonitor = {
  _v: 1;
  id: string;
  item_id: string;
  status: "active" | "paused" | "completed" | "failed" | "cancelled";
  cadence: "hourly" | "daily" | "weekly" | "monthly" | { cron: string };
  question: string;
  mode: "monitor_tick";
  source_plan: ResearchSourcePlan;
  synthesis_policy: {
    mode: "append_findings" | "digest" | "alert_on_change";
    alert_conditions?: string[];
  };
  next_run_at: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
};

type OutreachPlan = {
  _v: 1;
  id: string;
  item_id: string;
  kind: "survey_plan" | "interview_plan" | "outreach_message" | "response_analysis";
  state: "draft" | "ready_for_approval" | "approved" | "collecting" | "completed" | "cancelled";
  title: string;
  target_audience: string;
  draft: string;
  consent_text?: string;
  personal_data_classification: "none" | "public" | "private" | "sensitive";
  send_mode: "manual_export" | "adapter_send";
  approved_snapshot_id?: string;
  artifact_ids: string[];
  created_at: string;
  updated_at: string;
};
```

## Execution model

Incubation reuses aloop's daemon discipline:

- the daemon owns the objects, state transitions, events, artifacts, and retention
- all clients use `/v1/incubation/...`
- composer kickoff is just an agentic client path into the same objects; it creates or updates incubation items, comments, research runs, monitors, outreach plans, and proposals through the daemon API
- background research uses provider adapters and scheduler permits
- permits are owned by `research_run_id`, not by a hidden implementation session
- every research run emits durable events and artifacts
- source acquisition uses the same runtime extension manifest model as prompt context providers and `exec` steps; there is no separate plugin system
- experiment-loop attempts run through the existing sandbox adapter / deterministic exec-step path, not a new runner
- outreach integrations are ordinary daemon adapters with hardcoded policy tables, like tracker adapters
- current state is a SQLite projection and history is JSONL, same as sessions and setup runs
- agents express intent; the daemon performs mutations and promotions under policy

Incubation does **not** create implementation worktrees by default.

Research runs may read:

- the incubation item and its comments
- attached artifacts
- explicitly selected project files when scoped to a ready project
- setup discovery outputs when scoped to a setup-pending project
- online documentation, papers, repositories, forums, social feeds, videos/transcripts, market data, and external sources only when the configured source policy allows it

Research runs may not:

- edit repository files
- create tracker Epics or Stories directly
- start implementation sessions directly
- merge, close, or mutate change sets
- silently promote an item without producing a reviewable proposal
- contact external humans or accounts unless running under an approved outreach workflow

## Research runs

A `ResearchRun` is a daemon-owned background job associated with one incubation item.

```ts
type ResearchRunMode =
  | "source_synthesis"
  | "monitor_tick"
  | "outreach_analysis"
  | "experiment_loop";

type ResearchRun = {
  _v: 1;
  id: string;
  item_id: string;
  project_id?: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  mode: ResearchRunMode;
  phase?: "planning" | "question_development" | "source_acquisition" | "experimenting" | "synthesizing" | "reporting";
  question: string;
  provider_chain: string[];
  source_plan?: ResearchSourcePlan;
  experiment_plan?: ExperimentPlan;
  monitor_id?: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  artifact_ids: string[];
  findings_summary?: string;
  created_at: string;
  updated_at: string;
  ended_at?: string;
};
```

Research output should be evidence-first:

- concise answer
- cited findings or source references where available
- open questions
- risks and unknowns
- suggested next actions
- candidate promotion targets

For project-scoped research, the run may also produce a `RESEARCH.md`-style artifact, but that artifact remains daemon-managed until promotion. Incubation research is not an execution journal and should not be appended into project files automatically.

Research modes:

| Mode | Use | Primary output |
|---|---|---|
| `source_synthesis` | Deep Research style source gathering and cited synthesis | findings, source records, proposal candidates |
| `monitor_tick` | recurring market/ecosystem/source tracking | delta digest, alert, no-change record |
| `outreach_analysis` | survey/interview response analysis | anonymized response synthesis, proposal candidates |
| `experiment_loop` | AutoResearch-style active experimentation with an immutable oracle | experiment ledger, best candidate, rejected attempts |

See `docs/research/research-systems-2026.md` for the survey that motivated these modes.

## Source acquisition

Incubation research is not limited to text supplied by the user. A research run can declare a source plan.

```ts
type ResearchSourceKind =
  | "user_attachment"
  | "project_files"
  | "setup_discovery"
  | "web_page"
  | "official_docs"
  | "paper"
  | "repository"
  | "issue_tracker"
  | "forum"
  | "social"
  | "video"
  | "podcast"
  | "market_data"
  | "survey"
  | "manual_note";

type ResearchSourcePlan = {
  allowed_kinds: ResearchSourceKind[];
  queries?: string[];
  urls?: string[];
  accounts_or_channels?: string[];
  time_window?: { from?: string; to?: string };
  max_sources?: number;
  max_cost_usd?: number;
  require_citations: boolean;
  privacy_classification?: "public" | "private" | "sensitive";
};
```

Source acquisition rules:

- Every external source included in findings gets a source record with URL or stable locator, retrieval timestamp, source kind, title/author when known, and confidence notes.
- Video and podcast research should prefer transcripts when available; generated transcripts are artifacts and must be marked as machine-derived.
- Forum and social sources are evidence, not truth. Findings should summarize patterns and quote sparingly; representative samples and uncertainty matter.
- Market-data sources must preserve provider, symbol/query, time range, retrieval timestamp, and whether the data is delayed, sampled, or estimated.
- Source connectors must respect robots.txt, terms of service, authentication scope, and rate limits. If a source cannot be accessed under policy, the research run records that limitation instead of bypassing it.
- Private project files and public web/social data must not be blended without provenance. A synthesis should make clear which claims came from internal context and which came from external sources.

The daemon should treat source fetching as a policy-controlled capability, not an arbitrary network tool exposed to agents. A provider may reason over fetched context, but source acquisition, credentials, and rate limits remain daemon-controlled.

Source connectors are runtime extensions under `pipeline.md`'s manifest model:

- manifest declares source kind, auth requirements, rate limits, output schema, and privacy class
- daemon invokes the connector through the same supervised execution path used for deterministic `exec` steps
- connector output is normalized into source records and artifacts before any provider sees it
- connector failures emit events and limitations; providers do not bypass the connector by browsing directly

## Experiment loops

AutoResearch-style loops are active experimentation, not source synthesis. They are useful only when aloop can define a bounded mutable surface and an immutable oracle.

```ts
type ExperimentPlan = {
  mutable_surface: {
    kind: "file" | "config" | "prompt" | "sandbox_artifact";
    refs: string[];
  };
  immutable_oracle: {
    kind: "command" | "benchmark" | "rubric" | "external_eval";
    ref: string;
    metric: string;
    direction: "minimize" | "maximize";
  };
  attempt_budget: {
    max_attempts?: number;
    max_duration_seconds_per_attempt?: number;
    max_cost_usd?: number;
  };
  decision_rule: {
    keep_if: string;
    revert_or_discard_if: string;
  };
  environment_labels?: Record<string, string>;
  stop_conditions: string[];
};
```

Rules:

- The oracle/eval is read-only to the agent. If the agent can edit the checker, the result is invalid.
- The mutable surface is narrow and named before the run starts.
- Each attempt records diff/input, environment, metric result, cost, and keep/reject decision.
- Fixed per-attempt budgets are preferred so attempts are comparable.
- Plateau detection should stop or pause the run when marginal gains fall below the declared threshold.
- Experiment winners become proposals or artifacts; they do not mutate project code or tracker state until promoted.
- Attempts use the existing sandbox adapter and deterministic exec-step machinery. The daemon already knows how to run commands with cwd, timeout, env allow-list, event capture, artifacts, and policy; `experiment_loop` does not introduce another execution engine.
- Metrics are projected from attempt events by the same metrics projector used elsewhere. Agents can produce candidate changes, but they do not self-report the score that decides keep/reject.

This is the incubation analogue of Karpathy's `program.md` / `prepare.py` / `train.py` split:

| AutoResearch | Aloop incubation |
|---|---|
| human-authored `program.md` | incubation item + research protocol |
| immutable `prepare.py` / eval | `ExperimentPlan.immutable_oracle` |
| mutable `train.py` | `ExperimentPlan.mutable_surface` |
| fixed 5-minute run | `attempt_budget.max_duration_seconds_per_attempt` |
| `val_bpb` keep/revert | `decision_rule` + experiment ledger |

## Long-running monitors

Some incubation items are not answered by one research pass. They need watchfulness:

- market or competitor movement
- developer ecosystem changes
- provider/model capability changes
- regulatory changes
- social/community sentiment
- open-source project health
- adoption signals for an idea
- repeated price, funding, hiring, launch, or release signals

A monitor is a scheduled research program tied to an incubation item. Each tick creates a normal `ResearchRun` with `monitor_id` set. The run produces findings and artifacts; the monitor decides whether to append, digest, or alert.

Monitor outputs should distinguish:

- **new facts** since the previous run
- **trend movement** relative to prior snapshots
- **weak signals** that need more evidence
- **actionable changes** that should create or update proposals
- **noise / no material change**

Cadence is part of policy. Continuous does not mean an unbounded loop:

- every monitor has a cadence, budget cap, source plan, and stop condition
- every tick consumes scheduler permits and cost budget
- every monitor can be paused, resumed, or cancelled
- every monitor must expose last run, next run, accumulated cost, and recent deltas
- alerting must be based on explicit conditions, not "tell me everything"

Monitors are incubation objects, not sessions. They schedule research runs; they do not edit repos, trackers, specs, or session queues without proposal application.

## Active outreach and surveys

Market research can include asking people, not only reading public sources. That is useful but materially riskier than passive research.

Aloop should model outreach as a governed incubation workflow with human approval points.

Allowed outreach artifacts:

- survey plan
- target audience definition
- screener questions
- interview script
- outreach message draft
- respondent list supplied by the user
- consent text
- anonymized response summary
- raw-response artifact when retention policy allows it

Default policy:

- agents may draft outreach materials and analyze responses
- agents may not send messages, post publicly, DM accounts, buy ads, scrape personal contact data, or impersonate the user
- sending or publishing requires an explicit human-approved action through a configured outreach adapter or manual export
- personal data must be classified and retained under the project's privacy policy
- respondent consent and source of contact list must be recorded before any outbound action

Outreach promotion targets are proposals, not automatic campaigns. A useful flow is:

```text
research item -> outreach proposal -> human approves survey/interview plan
              -> collect responses manually or through approved adapter
              -> analysis research run -> synthesis/proposal
```

Future adapters may integrate with survey tools, email tools, CRM systems, or paid research panels, but those adapters reuse the same daemon adapter pattern as tracker/provider adapters and need their own policy table before agents can use them. There is no outreach-specific privileged path.

## Synthesis and proposals

Raw research is not enough for promotion. A synthesis turns captures, comments, and research artifacts into a reviewable object.

```ts
type IncubationProposal = {
  _v: 1;
  id: string;
  item_id: string;
  kind:
    | "setup_candidate"
    | "spec_change"
    | "epic"
    | "story"
    | "steering"
    | "decision_record"
    | "discard";
  title: string;
  body: string;
  rationale: string;
  evidence_refs: string[];
  target?: PromotionTarget;
  state: "draft" | "ready" | "applied" | "rejected";
  created_at: string;
  updated_at: string;
};
```

Proposal bodies are preview-before-apply. The dashboard may render them as diffs, cards, or documents, but the daemon remains the source of truth.

## Promotion targets

Promotion is the handoff from incubation into an existing aloop subsystem.

| Target | Effect |
|---|---|
| `setup_run` | Starts or updates a setup run for a candidate project. |
| `spec_change` | Creates a reviewable spec/document proposal for an existing project. |
| `epic` | Creates an Epic through the tracker adapter; orchestrator later refines it. |
| `story` | Creates a Story only under an existing Epic and returns it to normal refinement gates. |
| `steering` | Queues a steering instruction against a selected running session. |
| `decision_record` | Stores a durable decision note without creating implementation work. |
| `discard` | Closes the item with rationale. |

Promotion is never a hidden side effect of research completion. A client or policy-authorized agent must apply a proposal through the API, and the resulting target object records a back-reference to the incubation item.

## Client surfaces

Incubation has two complementary client modes:

- **Conversational kickoff** through the global composer agent.
- **Structured management** through the incubation workstation.

The composer is the preferred path for raw intent because early ideas are usually incomplete and often multimodal. It can accept text, links, screenshots, voice notes, videos, documents, logs, and pasted threads; ask clarifying questions; infer scope; prepare a source plan; propose a budget; and start a research run or monitor after the daemon validates the request. The resulting state is still an `IncubationItem`, `ResearchRun`, `ResearchMonitor`, `OutreachPlan`, or `IncubationProposal`, with media preserved as artifacts.

The workstation should expose incubation as a first-class surface, not as a generic chat thread.

Required surfaces:

- capture inbox
- item detail with comments, artifacts, related items, and provenance
- research queue and run inspector
- source plan editor and cited source browser
- monitor list, monitor detail, cadence/budget controls, and alert history
- outreach proposal review with consent/privacy checks
- synthesis/proposal review
- promotion target picker
- mobile-friendly capture and triage

The phone-optimized flow is intentionally narrow:

- capture
- attach context
- triage
- start lightweight research
- review monitor alerts
- approve, reject, or comment on a synthesis
- check active research status

Deep diff review, session inspection, and tracker board management remain desktop-first.

## Relationship to setup, tracker, and sessions

Incubation sits before all three:

```text
capture -> research -> synthesis -> promotion
                                      |
                                      +-> setup run
                                      +-> spec proposal
                                      +-> Epic / Story
                                      +-> session steering
                                      +-> decision record
```

Setup may consume incubation items as input, but setup readiness remains independent. A compelling incubation proposal does not make a project ready.

Tracker work items may be created from incubation proposals, but they become normal tracker entities immediately after creation. From that point onward, orchestrator refinement, status maps, file-scope gates, and workflow selection apply.

Research runs are not implementation sessions. They reuse provider/scheduler/event infrastructure, but their write policy is stricter and their outputs are evidence/proposals rather than commits.

## Retention

Incubation objects are useful institutional memory, but raw capture can become clutter.

Recommended retention defaults:

- active items: retained indefinitely until promoted, discarded, or archived
- active monitors: retained while active; history retained with the parent item
- discarded items: hidden by default after 30 days, retained for 180 days
- research artifacts: retained with the item; large binary attachments follow artifact retention policy
- outreach raw responses: retained according to privacy policy, with stricter defaults than public-source research
- promoted items: retained as provenance as long as the promoted target exists

Retention is policy; deletion must emit events and preserve enough tombstone data for backlinks not to break silently.

## Invariants

1. **Incubation is durable.** Useful ideas, research, comments, and proposals are daemon-owned objects, not browser-local chat state.
2. **Research is non-mutating by default.** It produces evidence and proposals, not repo edits or tracker changes.
3. **Promotion is explicit.** Creating setup runs, spec proposals, work items, or steering instructions requires an apply step.
4. **Provenance is preserved.** Promoted targets link back to the incubation item and evidence that created them.
5. **One API.** Mobile web, dashboard, CLI, bots, and future integrations use the same `/v1/incubation` contract.
6. **No tracker overload.** Vague ideas do not become Epics or Stories until they satisfy the promotion target's normal readiness expectations.
7. **No scheduler bypass.** Background research consumes provider permits like any other provider-backed work.
8. **Sources are governed.** External acquisition is source-planned, cited, rate-limited, and policy-controlled.
9. **Continuous is bounded.** Monitors have cadence, budgets, stop conditions, and explicit alert policies.
10. **Outreach requires approval.** Agents may draft and analyze outreach, but outbound contact requires human approval and consent/privacy records.

See: `api.md`, `dashboard.md`, `setup.md`, `work-tracker.md`, `orchestrator.md`.
