# API

> **Reference document.** The v1 HTTP + SSE contract between clients (CLI, dashboard, bots, scripts) and the `aloopd` daemon.
>
> Every action against aloop goes through this API. No side channels.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.

## Table of contents

- Versioning
- Transport and auth
- Standards baseline
- Common envelope (request, response, errors)
- Workspaces
- Projects
- Composer
- Incubation
- Sessions
- Steering
- Events (SSE)
- Artifacts
- Agent streaming (forward-compat)
- Providers
- Overrides
- Scheduler
- Daemon
- Metrics

---

## Versioning

All paths are prefixed with `/v1/`. Breaking changes increment the major. Additive changes (new fields, new endpoints, new event topics) do not.

Clients send `X-Aloop-Client: <name>/<version>` for telemetry and compatibility decisions. Not enforced.

## Transport and auth

- **HTTP/1.1** over localhost (`127.0.0.1` by default). JSON in, JSON out. Port configurable in `~/.aloop/daemon.yml` (default 7777, auto-written if `null`). Used by the dashboard (browsers can't talk to unix sockets) and by any remote/tunneled client.
- **Unix socket** at `~/.aloop/aloopd.sock` — **required in v1**. Local clients (CLI, shim, `aloop-agent`) prefer the socket; it's faster and avoids port exposure. The container's bind-mount of `.aloop/` brings the socket into the sandbox so in-container `aloop-agent` calls go directly back to the host daemon. API contract is identical over socket and HTTP.
- **SSE** for streams. Plain `text/event-stream`, no WebSocket in v1. Works over both transports.
- **Auth:** localhost-only deployments are unauthenticated. Remote/tunneled deployments require `Authorization: Bearer <token>` where the token is read from `~/.aloop/token` (generated on install). CORS: `*` for localhost, restricted list for remote.

## Standards baseline

The v1 API should remain boring and standards-aligned:

- paths and payloads should be describable by OpenAPI and JSON Schema
- request/response bodies are JSON unless the endpoint is explicitly media upload/download
- media uses normal MIME types and daemon artifact URLs
- streaming uses SSE events with replayable event IDs
- exports use JSONL/NDJSON where append-only logs matter
- idempotent creation uses `Idempotency-Key`
- remote auth uses standard `Authorization: Bearer` headers in v1 and should evolve toward OAuth/OIDC-compatible flows if aloop becomes multi-user
- errors use stable machine-readable codes plus human-readable messages

Do not add custom RPC frames, binary protocols, dashboard-only wire formats, or agent-only side channels. If an existing standard does not fit, document the gap in the relevant spec before introducing a new primitive.

## Common envelope

### Request

JSON body for `POST`, `PUT`, `PATCH`. Unknown fields rejected with `400 bad_request`. Enums are lowercase strings.

### Response

Success: resource JSON directly (not wrapped). List endpoints return `{ items: [...], next_cursor: string | null }`.

**Payload versioning.** Every event and mutable resource carries a `_v` field on its payload (not its envelope): `_v: 1` for v1 shapes. Additive changes keep `_v` at 1; breaking shape changes bump `_v`. Clients check `_v` if they care; unknowns are ignored on additive changes.

Error shape:

```json
{
  "error": {
    "code": "permit_denied",
    "message": "burn-rate gate: session exceeds $5/commit threshold",
    "details": { "session_id": "s_abc", "observed": 7.20, "threshold": 5.00 }
  }
}
```

Codes are stable identifiers (`not_found`, `bad_request`, `conflict`, `permit_denied`, `provider_unavailable`, `budget_exceeded`, `rate_limited`, `internal`). HTTP status is advisory — always consume `error.code`.

### Idempotency

Mutations that create resources accept `Idempotency-Key: <uuid>`. Repeat key within 24h returns the original result.

## Workspaces

A workspace is an operator grouping across one or more projects/repos. It is not itself runnable; it scopes dashboards, incubation, defaults, budgets, cross-project research, and aggregate views.

### List

```
GET /v1/workspaces
GET /v1/workspaces?q=<text>&limit=<n>&cursor=<cursor>
```

Returns `{ items: [{id, name, description, default_project_id, project_counts, created_at, updated_at}] }`.

### Create

```
POST /v1/workspaces
{
  "name": "Aloop",
  "description": "Harness product and related repos",
  "default_budget_usd_per_day": 25.00,
  "metadata": {}
}
```

### Get / update / archive

```
GET    /v1/workspaces/:id
PATCH  /v1/workspaces/:id
DELETE /v1/workspaces/:id        // archive; does not archive contained projects by default
```

### Membership

```
GET  /v1/workspaces/:id/projects
POST /v1/workspaces/:id/projects
{ "project_id": "p_...", "role": "primary|supporting|dependency|experiment" }
DELETE /v1/workspaces/:id/projects/:project_id
```

Projects may belong to zero, one, or multiple workspaces. A project remains the execution boundary even when it belongs to multiple workspaces.

## Projects

The daemon serves N projects. A project is the smallest setup-gated and runnable aloop unit. It usually maps to one Git repo or subfolder, but workspaces may group multiple projects/repos above it. Every session op carries `project_id`.

### List

```
GET /v1/projects
GET /v1/projects?path=<abs_path>   // lookup by filesystem path
GET /v1/projects?workspace_id=<id> // projects linked to a workspace
```

Returns `{ items: [{id, workspace_ids, abs_path, repo_url, name, added_at, last_active_at, session_counts}] }`.

### Register

```
POST /v1/projects
{
  "abs_path": "/home/pj/Dev/ralph-skill",
  "repo_url": "https://github.com/johnnyelwailer/ralph-skill.git",
  "name": "ralph-skill",
  "workspace_ids": ["w_..."]
}
```

Canonicalizes path, returns existing if already registered. Workspace membership can be supplied at registration time or managed later.

### Get / update / archive

```
GET    /v1/projects/:id
PATCH  /v1/projects/:id        // rename
DELETE /v1/projects/:id        // archive (soft-delete)
POST   /v1/projects/:id/purge  // hard-delete sessions, logs, worktrees
```

## Composer

The composer is the universal agentic intent interface for the app. It is used by dashboard, mobile web, CLI, and future capture surfaces to turn natural-language intent into scoped delegation plans, normal daemon-owned objects, and policy-checked daemon mutations.

The composer is not a privileged backend. It should not directly hold every specialized tool. A composer turn may delegate to scoped subagents that create or update incubation items, comments, research runs, monitors, outreach plans, projects, setup runs, tracker proposals, steering instructions, sessions, provider overrides, scheduler limits, daemon config, or project config only through the same daemon mutation path those objects use elsewhere.

The composer is multimodal and voice-first where useful. Clients submit media as artifact references or upload them first through `/v1/artifacts`; the daemon normalizes them into artifacts, derived text, transcripts, OCR, source records, and provenance before provider reasoning.

### Turns

```
GET  /v1/composer/turns?scope_kind=<kind>&scope_id=<id>&limit=<n>&cursor=<cursor>
POST /v1/composer/turns
{
  "scope": {
    "kind": "global" | "project" | "incubation_item" | "setup_run" | "work_item" | "session" | "spec_section",
    "id": "optional-object-id"
  },
  "message": "Research whether mobile capture should become part of aloop.",
  "artifact_refs": [
    { "artifact_id": "a_...", "role": "screenshot", "selection": null }
  ],
  "media_inputs": [
    {
      "kind": "image|audio|speech|video|document|url|code|log|diff",
      "artifact_id": "a_...",
      "url": null,
      "caption": "Optional user note about this media",
      "transcript_artifact_id": "a_transcript_optional",
      "transcript_text": "Optional client-side or precomputed transcript",
      "transcript_source": "client|daemon|provider|external|null",
      "derived_refs": []
    }
  ],
  "context_refs": [
    { "kind": "project", "project_id": "p_..." },
    { "kind": "incubation_item", "item_id": "i_..." }
  ],
  "intent_hint": "capture|research|monitor|project|setup|plan|configure|steer|explain|summarize|apply",
  "allowed_action_classes": [
    "read",
    "capture",
    "research",
    "project",
    "setup",
    "tracker",
    "runtime",
    "provider",
    "scheduler",
    "config",
    "artifact"
  ],
  "delegation_policy": {
    "allow_subagents": true,
    "max_subagents": 3,
    "require_preview_for_mutations": true
  },
  "provider_chain": ["codex", "claude"],
  "transcription": {
    "mode": "auto|native_provider|fallback_transcriber|client_supplied",
    "language": "auto",
    "allow_client_transcript": true
  },
  "max_cost_usd": 1.50,
  "approval_policy": "preview_required"
}
GET    /v1/composer/turns/:id
POST   /v1/composer/turns/:id/cancel
GET    /v1/composer/turns/:id/chunks
GET    /v1/composer/turns/:id/launched
```

The response includes:

```json
{
  "_v": 1,
  "id": "ct_...",
  "scope": { "kind": "global" },
  "status": "queued|running|waiting_for_approval|completed|failed|cancelled",
  "intent_hint": "research",
  "media_mode": "native|derived|none",
  "voice_mode": "native|transcribed|client_transcribed|none",
  "delegated_refs": [
    {
      "kind": "control_subagent_run",
      "id": "csr_...",
      "role": "config-editor",
      "scope": { "kind": "project", "id": "p_..." },
      "status": "running"
    }
  ],
  "launched_refs": [
    { "kind": "incubation_item", "id": "i_..." },
    { "kind": "research_run", "id": "rr_..." }
  ],
  "proposed_actions": [
    {
      "id": "act_...",
      "class": "config",
      "method": "PUT",
      "path": "/v1/providers/overrides",
      "summary": "Prefer codex before claude for new turns",
      "produced_by": { "kind": "control_subagent_run", "id": "csr_..." },
      "risk": "low|medium|high",
      "requires_approval": true
    }
  ],
  "proposal_refs": [],
  "usage": { "tokens_in": 1234, "tokens_out": 456, "cost_usd": 0.12 },
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-01T10:01:00Z"
}
```

Composer turns acquire scheduler permits before provider calls. A turn that launches long-running work returns quickly once the daemon has created the child object; status for that work is observed through the child object's own endpoints and events.

Risky or durable mutations should return `waiting_for_approval` with a structured preview instead of applying immediately. Examples: project registration or purge, promotion, tracker mutation, setup-state mutation, provider override, scheduler limit change, daemon config change, project config change, outreach send, session start, or repository-affecting steering. Read-only explanations and low-risk capture/comment creation may complete without preview depending on policy.

The launched object, not the composer transcript, is the source of truth. For example, "track this market weekly" creates a `ResearchMonitor`; the composer turn only records how it was requested and which objects it launched.

### Delegated control planning

The composer can coordinate any operation exposed by the daemon API, but it should delegate specialized work to scoped subagents instead of directly wielding all tools. It does not get private endpoints. The composer or its subagents emit proposed actions that reference normal API paths, payloads, and target objects.

Delegation and action planning requirements:

- each delegated subagent has a role, scope, budget, timeout, and explicit capability grant
- subagent tool access is narrower than the composer's user-facing breadth
- every proposed mutation has an action class, target path, summary, risk level, and approval requirement
- multi-step requests become ordered action plans, for example `POST /v1/projects` then `POST /v1/setup/runs`
- config changes are represented as patches or full replacement documents using the same config endpoints as the dashboard configuration center
- policy-sensitive actions must be previewed and audited before application
- the composer may explain, revise, or discard proposed actions before apply
- applied actions emit the same events as if the user had clicked the corresponding structured UI control
- the daemon, not the subagent, performs the final mutation after policy checks

Useful examples:

| User request | Delegated subagent | Proposed daemon path |
|---|---|
| "Set up this repo as a new aloop project" | `project-setup` | `POST /v1/projects` then `POST /v1/setup/runs` |
| "Use codex first for this project" | `config-editor` | project config patch or `PUT /v1/providers/overrides` depending on scope |
| "Lower global concurrency" | `scheduler-operator` | scheduler/daemon config patch |
| "Archive this project" | `project-setup` or `config-editor` | `DELETE /v1/projects/:id` |
| "Start three implementation agents" | `runtime-operator` | tracker/orchestrator/session mutations after policy checks |
| "Show every config change today" | `audit-explainer` | read audit/event projections |

There should be no meaningful app capability that is unreachable from the composer. If the daemon API can do it, the composer can coordinate a scoped subagent to inspect or propose it; if policy allows it and approval is satisfied, the daemon can apply it.

### Multimodal normalization

Composer media handling reuses artifacts and source records:

- images/screenshots may produce OCR text, visual summaries, dimensions, and thumbnail artifacts
- speech/audio/voice notes may produce transcript artifacts plus language, timing, speaker, and confidence metadata
- videos/screen recordings may produce transcript artifacts, keyframe artifacts, and timestamped notes
- PDFs/documents may produce extracted text chunks, page-image artifacts, and document metadata
- URLs may produce source records and fetched artifacts under source policy
- code/log/diff pastes may become typed text artifacts when they are too large or need provenance

Provider adapters declare whether they support native image, audio, video, and document inputs. If a provider lacks a native modality, the daemon passes derived text/transcript/OCR artifacts instead and marks the composer turn with `media_mode: "derived"`.

Generated or transformed media is returned as artifacts. The transcript may render it inline, but durable downstream objects reference artifact IDs.

### Voice input

Voice is a first-class composer mode. A client may stream or upload speech audio as an artifact, but the daemon owns transcription policy and provenance.

Transcription flow:

1. If the selected provider/model supports native speech input and policy allows it, the daemon may pass the audio artifact through the provider adapter and set `voice_mode: "native"`.
2. Otherwise the daemon selects a configured fallback transcriber, writes a transcript artifact, and sends the transcript plus artifact references to the composer provider with `voice_mode: "transcribed"`.
3. If the client supplies a transcript from browser/device speech recognition, the daemon may accept it for latency but records `voice_mode: "client_transcribed"` and keeps the original audio artifact when available.

Streaming transcription may publish `agent.chunk` entries with `type: "transcript"` before the composer turn is sent. Clients must treat partial transcript chunks as editable draft material, not final daemon state until the turn is submitted.

Transcript metadata should include language, confidence, timing offsets when available, transcriber id, and whether the transcript is human-edited.

## Incubation

Incubation is the API surface for capture, research, synthesis, and explicit promotion before work becomes setup, spec, tracker, or session state. See `incubation.md` for lifecycle and object shapes.

### Items

```
GET  /v1/incubation/items?scope=global|project|candidate_project&project_id=<id>&state=<csv>&q=<text>&limit=<n>&cursor=<cursor>
POST /v1/incubation/items
{
  "scope": { "kind": "global" },
  "title": "Investigate mobile capture for aloop",
  "body": "Raw note, link, transcript, or pasted observation.",
  "labels": ["product"],
  "priority": "normal",
  "artifact_ids": [],
  "source": { "client": "mobile-web", "url": "https://example.com" }
}
GET    /v1/incubation/items/:id
PATCH  /v1/incubation/items/:id
DELETE /v1/incubation/items/:id        // archive by default; hard delete is a future policy-gated operation
```

`PATCH` may edit title/body/labels/priority/state, but may not set `promoted` directly. Promotion happens through proposals.

### Comments

```
GET  /v1/incubation/items/:id/comments
POST /v1/incubation/items/:id/comments
{ "body": "Clarification or feedback", "artifact_refs": [] }
```

Comments are durable object-level discussion. They are not a chat transcript hidden inside a client.

### Research runs

```
GET  /v1/incubation/items/:id/research-runs
POST /v1/incubation/items/:id/research-runs
{
  "mode": "source_synthesis",
  "question": "What architecture changes would mobile capture require?",
  "provider_chain": ["opencode", "codex", "claude"],
  "source_plan": {
    "allowed_kinds": ["official_docs", "forum", "video", "social"],
    "queries": ["mobile capture developer workflow research"],
    "urls": [],
    "max_sources": 25,
    "require_citations": true,
    "privacy_classification": "public"
  },
  "context_refs": [
    { "kind": "project", "project_id": "p_..." },
    { "kind": "artifact", "artifact_id": "a_..." }
  ],
  "max_cost_usd": 5.00
}
GET    /v1/incubation/research-runs/:id
POST   /v1/incubation/research-runs/:id/pause
POST   /v1/incubation/research-runs/:id/resume
DELETE /v1/incubation/research-runs/:id
GET    /v1/incubation/research-runs/:id/events
```

Research runs acquire scheduler permits before provider turns. They are non-mutating by default and return findings, artifacts, open questions, and candidate proposals.

`mode` is one of `source_synthesis`, `monitor_tick`, `outreach_analysis`, or `experiment_loop`. `source_synthesis` requires a `source_plan`; `experiment_loop` requires an `experiment_plan`; monitor-created runs set `monitor_id`.

### Experiment loops

```
POST /v1/incubation/items/:id/research-runs
{
  "mode": "experiment_loop",
  "question": "Find a faster parser configuration for this benchmark.",
  "provider_chain": ["codex", "opencode"],
  "experiment_plan": {
    "mutable_surface": { "kind": "config", "refs": ["bench/parser/config.yml"] },
    "immutable_oracle": {
      "kind": "benchmark",
      "ref": "bench/parser/run.sh",
      "metric": "p95_latency_ms",
      "direction": "minimize"
    },
    "attempt_budget": {
      "max_attempts": 50,
      "max_duration_seconds_per_attempt": 300,
      "max_cost_usd": 20.00
    },
    "decision_rule": {
      "keep_if": "p95_latency_ms improves by >= 3% without correctness failures",
      "revert_or_discard_if": "benchmark fails or improvement is below threshold"
    },
    "stop_conditions": ["no improvement after 10 attempts", "budget exhausted"]
  }
}
GET /v1/incubation/research-runs/:id/experiments
```

Experiment loops are AutoResearch-style bounded loops. The daemon records each attempt, metric result, environment labels, cost, and keep/reject decision. Winners are artifacts/proposals until explicitly promoted.

Attempts execute through the same sandbox/exec machinery used by deterministic workflow steps. Attempt history is an event projection, not a second experiment database.

### Source records

```
GET /v1/incubation/research-runs/:id/sources
GET /v1/incubation/sources/:source_id
```

Source records capture provenance for every external input used by a research run: source kind, URL or stable locator, title/author when known, retrieval timestamp, citation metadata, transcript/artifact references, confidence notes, and policy limitations.

Source records are daemon artifacts plus SQLite projections over JSONL events. The API exposes the normalized records; source connectors themselves are runtime extensions, not a separate API/runtime family.

### Monitors

```
GET  /v1/incubation/items/:id/monitors
POST /v1/incubation/items/:id/monitors
{
  "question": "Track how browser automation agents evolve over the next quarter.",
  "cadence": "weekly",
  "mode": "monitor_tick",
  "source_plan": {
    "allowed_kinds": ["official_docs", "repository", "forum", "social", "video"],
    "queries": ["browser automation agent release notes", "computer use agent benchmarks"],
    "max_sources": 50,
    "require_citations": true,
    "privacy_classification": "public"
  },
  "synthesis_policy": {
    "mode": "alert_on_change",
    "alert_conditions": ["major product launch", "pricing change", "new benchmark result"]
  },
  "max_cost_usd_per_run": 3.00
}
GET    /v1/incubation/monitors/:id
PATCH  /v1/incubation/monitors/:id
POST   /v1/incubation/monitors/:id/pause
POST   /v1/incubation/monitors/:id/resume
DELETE /v1/incubation/monitors/:id
GET    /v1/incubation/monitors/:id/runs
```

Each monitor tick creates a normal research run with `monitor_id` set. Monitors do not mutate project, tracker, spec, or session state directly.

Monitor scheduling is a watchdog/reconcile job. Monitor ticks do not bypass scheduler permits, provider policy, or source-connector policy.

### Outreach

```
GET  /v1/incubation/items/:id/outreach
POST /v1/incubation/items/:id/outreach
{
  "kind": "survey_plan",
  "title": "Survey solo builders about autonomous coding dashboards",
  "target_audience": "solo developers and small-team technical founders",
  "draft": "...",
  "consent_text": "...",
  "personal_data_classification": "sensitive",
  "send_mode": "manual_export"
}
GET   /v1/incubation/outreach/:id
PATCH /v1/incubation/outreach/:id
POST  /v1/incubation/outreach/:id/approve
POST  /v1/incubation/outreach/:id/record-response
```

Agents may draft outreach and analyze recorded responses. Outbound contact is denied unless the outreach object has explicit human approval and the configured adapter/policy permits sending. `manual_export` creates an artifact for the human to use elsewhere; it does not send.

Outreach adapters, when added, use the same daemon adapter/audit pattern as tracker adapters. The API never exposes a raw email/social/survey-send side channel to agents or clients.

### Proposals and promotion

```
GET  /v1/incubation/items/:id/proposals
POST /v1/incubation/items/:id/proposals
{
  "kind": "epic",
  "title": "Mobile capture and incubation inbox",
  "body": "...",
  "rationale": "...",
  "evidence_refs": ["a_..."],
  "target": { "kind": "project", "project_id": "p_..." }
}
GET   /v1/incubation/proposals/:id
PATCH /v1/incubation/proposals/:id
POST  /v1/incubation/proposals/:id/apply
```

`apply` performs the target-specific mutation and returns the created target reference. Examples:

- `setup_run` -> `POST /v1/setup/runs`
- `spec_change` -> creates a reviewable spec/document proposal
- `epic` / `story` -> tracker adapter `createWorkItem`
- `steering` -> `POST /v1/sessions/:id/steer`
- `decision_record` -> durable non-implementation note
- `discard` -> closes the item with rationale

The daemon records back-links both ways: the promoted target references the incubation item, and the item records `promoted_refs`.

## Sessions

Session kinds: `standalone`, `orchestrator`, `child`. All use the same endpoints.

### List

```
GET /v1/sessions?project_id=<id>&status=running&kind=child&parent=<id>
```

Query params: `project_id`, `status` (csv), `kind` (csv), `parent` (id), `limit`, `cursor`.

Returns list of session summaries (no event logs — use `/events` for those).

### Create

```
POST /v1/sessions
{
  "project_id": "p_...",
  "kind": "standalone",
  "workflow": "plan-build-review",
  "provider_chain": ["opencode", "copilot", "codex", "gemini", "claude"],
  "issue": 42,                            // optional, for child/standalone runs
  "parent_session_id": null,              // required for kind=child
  "max_iterations": null,                 // null = no cap
  "notes": "optional free text"
}
```

Validation:
- `kind=child` requires `parent_session_id` and forbids creating grandchildren
- `provider_chain` is resolved against overrides at turn time, not create time
- `workflow` must exist in project's workflow catalog or be a bundled default

Returns the created session. Status starts as `pending`; the scheduler promotes to `running` when first permit is granted.

### Get

```
GET /v1/sessions/:id
```

Full detail: current phase, iteration, provider, permit state, aggregates (cost, tokens, commits), last-event-id.

### Stop

```
DELETE /v1/sessions/:id?mode=graceful|force
```

- `graceful` (default): finish current turn, do not start next, close with `status=stopped`.
- `force`: kill provider process, mark `status=stopped`, emit `session.forced`.
- Orchestrator `DELETE` cascades to all children with a grace period.

### Resume

```
POST /v1/sessions/:id/resume
```

Valid only when `status in (interrupted, stopped, paused)`. Reconstructs state from JSONL + SQLite, requests new permit, continues.

### Pause

```
POST /v1/sessions/:id/pause
POST /v1/sessions/:id/unpause
```

Pause holds at the next cycle boundary (does not kill in-flight turn).

## Steering

```
POST /v1/sessions/:id/steer
{
  "instruction": "Focus on tests for the permit gate",
  "affects_completed_work": "no"         // yes | no | unknown
}
```

Writes a queue file in the session's `queue/` dir with appropriate frontmatter. Loop picks up next iteration. Returns the queued prompt's filename and position.

```
GET /v1/sessions/:id/queue
DELETE /v1/sessions/:id/queue/:queue_item_id
```

List / cancel queued items (e.g. oversteer).

## Events (SSE)

The global event bus. All state changes, log lines, and streaming content publish here.

### Subscribe

```
GET /v1/events?topics=session.*,provider.*&project_id=<id>&session_id=<id>&research_run_id=<id>&composer_turn_id=<id>&control_subagent_run_id=<id>&parent=<orch_id>&since=<event_id>
```

Response: `text/event-stream`.

- `topics`: csv of topic patterns, `*` is glob. Default subscribes to all.
- `project_id`: filter to a project's events.
- `session_id`: filter to a single session.
- `research_run_id`: filter to a single incubation research run.
- `composer_turn_id`: filter to a single composer turn.
- `control_subagent_run_id`: filter to a single scoped control subagent run.
- `parent`: filter to a session's children (for orchestrators).
- `since`: resume from a prior event id. Daemon streams missed events then switches to live tail.

Browsers send `Last-Event-ID` automatically on reconnect.

### Envelope

```
id: 1744986531.000042
event: session.update
data: {"session_id":"s_abc","phase":"build","iteration":3,...}
```

Every event has a monotonic `id` (ms timestamp + sequence). Events are durable (backed by JSONL per session + a daemon-level index), so `since` is replayable.

### Topics

| Topic | When | Payload shape |
|---|---|---|
| `session.update` | phase / iteration / status / provider change | session summary |
| `session.stuck` | watchdog hit | `{session_id, last_event_at, elapsed}` |
| `session.interrupted` | crash recovery | session summary |
| `session.event` | any entry written to session JSONL | the full JSONL record |
| `provider.health` | cooldown entry/exit, failure classification | health state |
| `provider.quota` | quota probe result | `{provider_id, remaining, reset_at}` |
| `provider.override.changed` | overrides PUT | new overrides doc |
| `scheduler.limits.changed` | scheduler limits PUT | `{limits}` |
| `scheduler.permit.grant` | permit issued | `{permit_id, session_id?, research_run_id?, composer_turn_id?, control_subagent_run_id?, provider_id, ttl}` |
| `scheduler.permit.deny` | permit refused | `{session_id?, research_run_id?, composer_turn_id?, control_subagent_run_id?, reason, gate, details}` |
| `scheduler.permit.release` | permit released | `{permit_id, session_id?, research_run_id?, composer_turn_id?, control_subagent_run_id?}` |
| `scheduler.permit.expired` | TTL reclaim | `{permit_id, session_id?, research_run_id?, composer_turn_id?, control_subagent_run_id?}` |
| `scheduler.burn_rate_exceeded` | burn gate tripped for a session | `{session_id, observed, threshold}` |
| `composer.turn.changed` | composer turn queued, running, waiting for approval, completed, failed, or cancelled | composer turn summary |
| `composer.subagent.changed` | scoped control subagent queued, running, completed, failed, or cancelled | control subagent run summary |
| `composer.action.previewed` | composer produced a structured mutation preview requiring approval | preview summary |
| `incubation.item.changed` | capture/edit/state change on an incubation item | incubation item summary |
| `incubation.comment.created` | comment added to an incubation item | comment summary |
| `incubation.research.update` | research run status, findings, or cost changed | research run summary |
| `incubation.source.recorded` | external source captured for a research run | source record summary |
| `incubation.experiment.recorded` | experiment-loop attempt finished | experiment attempt summary |
| `incubation.monitor.update` | monitor created, ticked, paused, alerted, or cancelled | monitor summary |
| `incubation.outreach.changed` | outreach plan, approval, or response state changed | outreach summary |
| `incubation.proposal.changed` | proposal created, edited, applied, or rejected | proposal summary |
| `agent.chunk` | streaming content from a provider turn | see below |
| `daemon.log` | daemon stdout relayed over SSE | `{level, message, fields}` |

### Backpressure and ordering

- Per-client buffer (default 1 MB). Overflow emits `warning.dropped` to the client and keeps the most recent events.
- **Clients MUST tolerate gaps** in event IDs and in `agent.chunk.sequence` — a gap indicates a drop, not a reorder.
- **Clients MUST NOT tolerate reordering** — the daemon never publishes events out of monotonic order within a topic. If a client observes an out-of-order event, that is a daemon bug, not a normal condition.
- Clients needing lossless tail read JSONL directly via `GET /v1/sessions/:id/log` or `/v1/sessions/:id/turns/:turn_id/chunks?replay=true`. The durable log is authoritative; SSE is best-effort live tail.

### Bulk tail

```
GET /v1/sessions/:id/log?since=<event_id>&format=jsonl
```

Returns `application/x-ndjson`, streaming. Useful for exports, offline analysis, and guaranteed-lossless clients.

## Artifacts

Artifacts are daemon-managed files associated with sessions, composer turns, control subagent runs, setup runs, incubation items, research runs, work items, or change sets. Proof outputs are the primary source, but clients may also upload images, audio, video, documents, or other files that should be referenced in discussion or composer turns.

This is the minimal runtime primitive that enables multimodal feedback without requiring clients or agents to speak tracker-native upload APIs.

### List / inspect / content

```
GET /v1/artifacts?project_id=<id>&session_id=<id>&composer_turn_id=<id>&control_subagent_run_id=<id>&setup_run_id=<id>&incubation_item_id=<id>&research_run_id=<id>&work_item_key=<key>&phase=proof&type=screenshot
GET /v1/artifacts/:id
GET /v1/artifacts/:id/content
```

- `GET /v1/artifacts` returns artifact metadata only.
- `GET /v1/artifacts/:id` returns one artifact's metadata.
- `GET /v1/artifacts/:id/content` returns the raw file bytes with the stored media type.

Illustrative metadata shape:

```json
{
  "_v": 1,
  "id": "a_01j...",
  "project_id": "p_...",
  "session_id": "s_...",
  "composer_turn_id": null,
  "control_subagent_run_id": null,
  "setup_run_id": null,
  "incubation_item_id": null,
  "research_run_id": null,
  "kind": "screenshot",
  "phase": "proof",
  "label": "dashboard-main",
  "filename": "dashboard-main.png",
  "media_type": "image/png",
  "bytes": 183441,
  "url": "/v1/artifacts/a_01j.../content",
  "created_at": "..."
}
```

### Upload

```
POST /v1/artifacts
Content-Type: multipart/form-data
fields:
  project_id=<id>
  session_id=<id>?         // optional
  composer_turn_id=<id>?   // optional
  control_subagent_run_id=<id>? // optional
  setup_run_id=<id>?       // optional
  incubation_item_id=<id>? // optional
  research_run_id=<id>?    // optional
  work_item_key=<key>?     // optional
  kind=image|screenshot|audio|speech|video|document|transcript|mockup|diff|log|code|other
  label=<short label>?     // optional
  file=<binary>
```

Returns the created artifact metadata.

This endpoint is intentionally generic but narrow:

- it lets the dashboard or other clients upload user-provided images for discussion
- it lets comments reference daemon-managed artifacts uniformly
- it avoids any direct tracker-native upload path from clients or agents

### Inline usage in comments

Comment bodies are markdown. Inline images use normal markdown image syntax and point at daemon-managed artifact URLs:

```md
Here is variant B:

![Variant B](/v1/artifacts/a_01j.../content)
```

Comments may also carry structured artifact references so clients do not need to scrape markdown to understand which artifacts are attached or embedded.

## Agent streaming (forward-compat)

Providers fall into two classes: **non-streaming** (output arrives once the turn completes) and **streaming** (output arrives in chunks as the model produces it). The API exposes the same shape for both; only the cadence of chunks differs.

### Subscribe

```
GET /v1/sessions/:id/turns/:turn_id/chunks
```

Response: SSE `event: agent.chunk`. Also published on the global bus.

Composer turns use:

```
GET /v1/composer/turns/:turn_id/chunks
```

Research runs and future provider-backed daemon jobs may expose owner-specific chunk endpoints as needed. The chunk payload always identifies the owner; clients must not assume every chunk belongs to an implementation session.

### Chunk payload

```json
{
  "owner": { "kind": "session", "id": "s_abc" },
  "session_id": "s_abc",
  "turn_id": "t_42",
  "sequence": 0,
  "type": "text",
  "content": { "delta": "..." },
  "final": false
}
```

- `sequence` is monotonic within a turn, starts at 0.
- `owner.kind` is `session`, `composer_turn`, `control_subagent_run`, or another provider-backed daemon job kind added later. `session_id` remains for v1 session compatibility.
- `type`: `text`, `transcript`, `thinking`, `tool_call`, `tool_result`, `usage`, `error`.
- `content` is type-specific; clients render what they know, ignore unknowns.
- `final: true` on the last chunk of the turn.

### Degraded behavior today

Providers are invoked as one-shot CLIs in v1; adapters emit:

1. One `agent.chunk` with `sequence: 0, type: "text", content.delta: <full output>, final: false`
2. One `agent.chunk` with `sequence: 1, type: "usage", content: {tokens_in, tokens_out, cost_usd}, final: true`

Clients that render chunks as they arrive show the full output at once; nothing to change when streaming lands.

### Future behavior

Provider adapters that support streaming (opencode already does; claude and codex have streaming modes to wire in) yield chunks as they arrive. Reasoning chunks (`type: "thinking"`) are retained only when `project.stream_reasoning: true` (off by default to control log size).

### Replay

Chunks are durable in the owning object's JSONL. `GET /v1/sessions/:id/turns/:turn_id/chunks?replay=true` and `GET /v1/composer/turns/:turn_id/chunks?replay=true` replay historical chunks for completed turns (useful for post-mortem UI).

## Providers

### Health

```
GET /v1/providers
```

Returns all registered providers with current health, quota (if probed), last failure, cooldown-until, and capabilities.

```
GET /v1/providers/:id/quota
```

On-demand quota probe (forces a call to the provider's quota endpoint where supported). Respects probe rate limits.

### Chain resolution (debug)

```
POST /v1/providers/resolve-chain
{ "session_id": "s_abc" }
```

Returns the ordered chain for a session *right now* given current overrides and health. Doesn't mutate anything.

## Overrides

Global immediate overrides. Live-applied at permit-grant time.

```
GET /v1/providers/overrides
```

Current overrides doc.

```
PUT /v1/providers/overrides
{
  "allow": ["opencode", "copilot"],      // whitelist (null = no restriction)
  "deny":  ["claude"],                   // blacklist (null = none)
  "force": null                          // "claude/opus@4.7" pins everything to this (null = off)
}
```

- `allow` and `deny` can coexist; `deny` wins on conflict.
- `force` overrides both.
- Persisted to `~/.aloop/overrides.yml` on success.
- Emits `provider.override.changed` on the bus.
- In-flight turns finish on whatever they were using; the *next* permit request respects the new policy.

```
DELETE /v1/providers/overrides
```

Resets to empty (equivalent to `PUT` with all-null).

## Scheduler

### Permits

```
POST /v1/scheduler/permits
{
  "session_id": "s_abc",
  "research_run_id": null,
  "composer_turn_id": null,
  "control_subagent_run_id": null,
  "provider_candidate": "opencode",
  "estimated_cost_usd": 0.03
}
```

Exactly one of `session_id`, `research_run_id`, `composer_turn_id`, or `control_subagent_run_id` is required. Sessions are the normal owner for implementation and orchestration turns; research runs are the owner for incubation research turns; composer turns are the owner for provider-backed intent-resolution turns; control subagent runs are the owner for scoped delegated control turns.

Returns:

```json
{
  "granted": true,
  "permit": { "id": "perm_xyz", "session_id": "s_abc", "research_run_id": null, "composer_turn_id": null, "control_subagent_run_id": null, "provider_id": "opencode", "ttl_seconds": 600 }
}
```

Default `ttl_seconds` is `scheduler.permit_ttl_default` from `daemon.yml` (default 600). Permit owners may request longer via `ttl_seconds` in the request body, capped at `scheduler.permit_ttl_max` (default 3600).

Or denial:

```json
{
  "granted": false,
  "reason": "burn_rate_exceeded",
  "gate": "burn_rate",
  "retry_after_seconds": 300,
  "details": { "observed": 7.20, "threshold": 5.00 }
}
```

```
DELETE /v1/scheduler/permits/:id        // release
GET    /v1/scheduler/permits            // list in-flight
```

### Limits

```
GET /v1/scheduler/limits
PUT /v1/scheduler/limits
{
  "concurrency_cap": 3,
  "cpu_max_pct": 80,
  "mem_max_pct": 85,
  "burn_rate": { "max_usd_per_commit": 5.00, "min_commits_per_hour": 1 }
}
```

Hot-reloadable. Takes effect on the next permit request.

## Setup

Setup is a resumable, long-lived setup orchestration for onboarding a project. CLI and dashboard are first-class API clients; external skill/chat hosts should drive the same API path (directly or through the CLI/shared client layer), not a privileged alternate backend. See `setup.md` for the phases and contract.

```
POST   /v1/setup/runs                        start a setup run for a project (or greenfield)
                                             body: { abs_path, mode?, non_interactive?, flags? }
GET    /v1/setup/runs                        list runs (active, completed, failed)
GET    /v1/setup/runs/:id                    current phase, progress, findings, unresolved ambiguities,
                                             readiness verdict, chapters/documents summary,
                                             background research summary, current question-set or confirmation step
GET    /v1/setup/runs/:id/chapters           chapter/document breakdown for rich clients
POST   /v1/setup/runs/:id/answer             body: { question_id, value } — supply interview answer
POST   /v1/setup/runs/:id/comments           body: { target_type, target_id, body, artifact_refs? } — add feedback /
                                             steering to a chapter or draft document, with optional attached or inline artifacts
POST   /v1/setup/runs/:id/approve-scaffold   user approves generated files before they land;
                                             rejected while blocking ambiguities remain
POST   /v1/setup/runs/:id/resume             continue an interrupted run
DELETE /v1/setup/runs/:id                    abort; may also unregister a still-setup_pending
                                             project when no sessions exist
GET    /v1/setup/runs/:id/events             SSE: setup events (discovery.*, interview.*,
                                             ambiguity.*, confirmation.*, generation.*,
                                             verification.*, completion.*)
```

On successful `verification` phase, the daemon transitions the project's `status` from `setup_pending` to `ready`. The setup run emits `setup.completed` only after the full flow is done, including optional orchestrator bootstrap when the selected mode requires it.

**Background research.** Setup runs may continue background research while awaiting user input, and may remain active across multiple days. `resume` returns the current stage rather than restarting the flow.

**Interactive fast path.** Structured-answer question flow should advance without waiting for the background setup orchestrator. The current question set is derived from the persisted question graph / setup state and may be updated immediately on answer submission. Freeform answers may invoke a small inline reasoning pass in the active shell/session; they should not require a full queued orchestrator turn just to select the next question.

**Readiness gate.** The daemon only allows scaffold, verification, or runtime-orchestrator bootstrap when the latest setup readiness verdict is `resolved`. Blocking ambiguities discovered from the repository, environment, or user answers stop the run before those transitions. In non-interactive mode, unresolved blocking ambiguity is a hard error rather than a fallback default.

**Abandonment retention.** Abandoned runs (no activity for `setup.abandoned_retention` from `daemon.yml`, default 14 days) are garbage-collected. `DELETE /v1/setup/runs/:id` is permitted any time; if the project was registered in the `setup_pending` state and has no associated sessions, the DELETE also unregisters it. Projects already `ready` are not unregistered by DELETE.

**`adapter.ping` flakiness.** The tracker readiness gate requires **2 of 3** consecutive `ping()` successes within a 10-second window before flipping the project's status to `ready`. Flakiness below that threshold is a real tracker signal and blocks setup from completing.

## Daemon

```
GET  /v1/daemon/health        // liveness + version + uptime + counters
GET  /v1/daemon/config
POST /v1/daemon/reload        // re-read daemon.yml, overrides.yml, project config.yml files
                              // applies to: scheduler limits, overrides, retention, project status maps
                              // does NOT apply to: HTTP bind/port (require restart)
                              // in-flight turns are never mutated; changes take effect on next permit
```

Code / binary upgrades require a graceful daemon restart (`aloop daemon stop` → replace binary → `aloop daemon start`). Migrations run from `schema_version` in SQLite before the listener opens. See `daemon.md` §Upgrade.

## Metrics

```
GET /v1/metrics               // Prometheus text-exposition format
```

Counters and gauges for sessions by status, permits by state, provider health, scheduler decisions, daemon resource usage. Cardinality kept bounded (no per-session labels on counters). Consumers: Prometheus scrapers, Grafana agents, dashboards that compute live deltas by polling this endpoint at their own cadence. Per-second resource metrics are NOT pushed over SSE — the bus stays event-driven.

---

## Shape stability

The following are v1-stable and will not break:

- Path structure (`/v1/<resource>/<id>/<sub>`)
- Session kinds and status values (`pending | running | paused | interrupted | stopped | completed | failed | archived`)
- Permit denial codes and gate names
- SSE topic names and envelope format
- `agent.chunk` payload shape
- Override keys (`allow`, `deny`, `force`)
- Error `code` field values
- Payload `_v` field (value `1` for v1)

Additive: new fields, new topics, new endpoints, new chunk types. Clients ignore unknowns.
