# API

> **Reference document.** The v1 HTTP + SSE contract between clients (CLI, dashboard, bots, scripts) and the `aloopd` daemon.
>
> Every action against aloop goes through this API. No side channels.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.

## Table of contents

- Versioning
- Transport and auth
- Common envelope (request, response, errors)
- Projects
- Sessions
- Steering
- Events (SSE)
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

## Projects

The daemon serves N unrelated repos. Every session op carries `project_id`.

### List

```
GET /v1/projects
GET /v1/projects?path=<abs_path>   // lookup by filesystem path
```

Returns `{ items: [{id, abs_path, name, added_at, last_active_at, session_counts}] }`.

### Register

```
POST /v1/projects
{ "abs_path": "/home/pj/Dev/ralph-skill", "name": "ralph-skill" }
```

Canonicalizes path, returns existing if already registered.

### Get / update / archive

```
GET    /v1/projects/:id
PATCH  /v1/projects/:id        // rename
DELETE /v1/projects/:id        // archive (soft-delete)
POST   /v1/projects/:id/purge  // hard-delete sessions, logs, worktrees
```

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
GET /v1/events?topics=session.*,provider.*&project_id=<id>&session_id=<id>&parent=<orch_id>&since=<event_id>
```

Response: `text/event-stream`.

- `topics`: csv of topic patterns, `*` is glob. Default subscribes to all.
- `project_id`: filter to a project's events.
- `session_id`: filter to a single session.
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
| `scheduler.permit.grant` | permit issued | `{permit_id, session_id, provider_id, ttl}` |
| `scheduler.permit.deny` | permit refused | `{session_id, reason, gate, details}` |
| `scheduler.permit.release` | permit released | `{permit_id, session_id}` |
| `scheduler.permit.expired` | TTL reclaim | `{permit_id, session_id}` |
| `scheduler.burn_rate_exceeded` | burn gate tripped for a session | `{session_id, observed, threshold}` |
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

## Agent streaming (forward-compat)

Providers fall into two classes: **non-streaming** (output arrives once the turn completes) and **streaming** (output arrives in chunks as the model produces it). The API exposes the same shape for both; only the cadence of chunks differs.

### Subscribe

```
GET /v1/sessions/:id/turns/:turn_id/chunks
```

Response: SSE `event: agent.chunk`. Also published on the global bus.

### Chunk payload

```json
{
  "session_id": "s_abc",
  "turn_id": "t_42",
  "sequence": 0,
  "type": "text",
  "content": { "delta": "..." },
  "final": false
}
```

- `sequence` is monotonic within a turn, starts at 0.
- `type`: `text`, `thinking`, `tool_call`, `tool_result`, `usage`, `error`.
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

Chunks are durable in the session's JSONL. `GET /v1/sessions/:id/turns/:turn_id/chunks?replay=true` replays historical chunks for a completed turn (useful for post-mortem UI).

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
{ "session_id": "s_abc", "provider_candidate": "opencode", "estimated_cost_usd": 0.03 }
```

Returns:

```json
{
  "granted": true,
  "permit": { "id": "perm_xyz", "session_id": "s_abc", "provider_id": "opencode", "ttl_seconds": 600 }
}
```

Default `ttl_seconds` is `scheduler.permit_ttl_default` from `daemon.yml` (default 600). Sessions may request longer via `ttl_seconds` in the request body, capped at `scheduler.permit_ttl_max` (default 3600).

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

Setup is a resumable, verified flow for onboarding a project. See `setup.md` for the phases and contract.

```
POST   /v1/setup/runs                        start a setup run for a project (or greenfield)
                                             body: { abs_path, mode?, non_interactive?, flags? }
GET    /v1/setup/runs                        list runs (active, completed, failed)
GET    /v1/setup/runs/:id                    current phase, progress, findings, pending prompts
POST   /v1/setup/runs/:id/answer             body: { question_id, value } — supply interview answer
POST   /v1/setup/runs/:id/approve-scaffold   user approves generated files before they land
POST   /v1/setup/runs/:id/resume             continue an interrupted run
DELETE /v1/setup/runs/:id                    abort (does not unregister project if already registered)
GET    /v1/setup/runs/:id/events             SSE: setup events (discovery.*, interview.*,
                                             generation.*, verification.*, completion.*)
```

On successful `verification` phase, the daemon transitions the project's `status` from `setup_pending` to `ready` and emits `setup.completed`.

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
